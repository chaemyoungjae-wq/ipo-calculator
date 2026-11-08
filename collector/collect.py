"""공모주 데이터를 모아 web/public/data/ipos.json 에 저장한다.

  python collector/collect.py            # 최근 3페이지 + 진행 중인 종목 갱신
  python collector/collect.py --pages 6  # 더 오래된 종목까지 채우기

수집에 실패하면 기존 파일을 그대로 두고 오류 코드로 끝난다. 앱은 마지막 정상 데이터를 계속 쓴다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sources  # noqa: E402

KST = timezone(timedelta(hours=9))
OUT = Path(__file__).parent.parent / "web" / "public" / "data" / "ipos.json"
MARKET_CLOSE = (15, 40)
SETTLED_DAYS = 3  # 상장 후 이 기간이 지나고 가격이 확정되면 더 이상 다시 읽지 않는다.


def is_settled(ipo: dict, today: str) -> bool:
    list_date = ipo.get("listDate")
    if not (ipo.get("priceFinal") and list_date):
        return False
    return (datetime.fromisoformat(today) - datetime.fromisoformat(list_date)).days > SETTLED_DAYS


def merge(old: dict, new: dict) -> dict:
    """새 값이 비어 있으면 이전 값을 지킨다. 사이트 구조가 잠깐 바뀌어도 데이터가 지워지지 않는다."""
    merged = dict(old)
    for key, value in new.items():
        if value not in (None, "", []):
            merged[key] = value
    return merged


def reconcile_prices(prices: dict, open38: int | None, close38: int | None) -> dict:
    """네이버 일봉은 상장 후 액면분할 등이 있으면 과거 가격까지 수정된다.

    시가와 종가가 같은 비율로 38과 다르면 수정주가로 보고 실제 상장일 가격으로 되돌린다.
    비율이 다르면 어느 쪽이 맞는지 알 수 없으므로 네이버 값을 두고 확인 표시를 남긴다.
    """
    result = {**prices, "priceCheck": False}
    if not open38 or open38 == prices["open"]:
        return result
    open_ratio = open38 / prices["open"]
    if close38 and prices["close"] and abs(close38 / prices["close"] / open_ratio - 1) < 0.02:
        result.update(open=open38, close=close38, high=round(prices["high"] * open_ratio),
                      low=round(prices["low"] * open_ratio))
    else:
        result["priceCheck"] = True
    return result


def update_prices(ipo: dict, now: datetime, warnings: list[str]) -> None:
    list_date, code = ipo.get("listDate"), ipo.get("code")
    today = now.date().isoformat()
    if not (list_date and code) or list_date > today or ipo.get("priceFinal"):
        return
    final = list_date < today or (now.hour, now.minute) >= MARKET_CLOSE
    try:
        prices = sources.fetch_prices(code, list_date)
    except Exception as e:  # 네이버가 막혀도 38 값으로 대신한다.
        warnings.append(f"{ipo['name']}: 네이버 시세 실패 ({e.__class__.__name__})")
        prices = None
    if prices:
        ipo.update(reconcile_prices(prices, ipo.get("open38"), ipo.get("close38")),
                   priceSource="naver", priceFinal=final)
        if ipo.get("priceCheck"):
            warnings.append(f"{ipo['name']}: 시초가 불일치 (네이버 {prices['open']}, 38 {ipo.get('open38')})")
    elif ipo.get("open38"):
        ipo.update(open=ipo["open38"], close=ipo.get("close38"), priceSource="38")


def collect(pages: int, now: datetime) -> dict:
    today = now.date().isoformat()
    previous: dict[int, dict] = {}
    if OUT.exists():
        previous = {i["no"]: i for i in json.loads(OUT.read_text(encoding="utf-8"))["ipos"]}

    schedule, listings = sources.fetch_lists(pages)
    if not schedule or not listings:
        raise RuntimeError(f"38 목록을 읽지 못했습니다 (일정 {len(schedule)}건, 상장 {len(listings)}건)")

    base = {no: dict(ipo) for no, ipo in previous.items()}
    for row in schedule + listings:
        base[row["no"]] = merge(base.get(row["no"], {}), row)

    warnings: list[str] = []
    failed = attempted = 0
    for no, ipo in base.items():
        if not is_settled(ipo, today):
            attempted += 1
            try:
                detail = sources.fetch_detail(no)
                if not detail["underwriters"] and not detail["subStart"]:
                    raise ValueError("상세 항목이 비어 있음")
                base[no] = ipo = merge(ipo, detail)
            except Exception as e:
                failed += 1
                warnings.append(f"{ipo.get('name', no)}: 상세 읽기 실패 ({e.__class__.__name__})")
        update_prices(ipo, now, warnings)

    if attempted and failed > attempted / 2:
        raise RuntimeError(f"상세 페이지 {attempted}건 중 {failed}건 실패: 사이트 구조 변경 가능성")

    ipos = sorted(base.values(), key=lambda i: i.get("subStart") or i.get("listDate") or "", reverse=True)
    return {"updatedAt": now.isoformat(timespec="minutes"), "warnings": warnings, "ipos": ipos}


def write_atomic(data: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, OUT)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=3)
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        data = collect(args.pages, datetime.now(KST))
    except Exception as e:
        print(f"수집 실패, 기존 파일 유지: {e}", file=sys.stderr)
        return 1
    write_atomic(data)
    print(f"{len(data['ipos'])}개 종목 저장, 경고 {len(data['warnings'])}건")
    for w in data["warnings"]:
        print(" -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
