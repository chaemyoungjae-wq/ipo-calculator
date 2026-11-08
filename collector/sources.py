"""38커뮤니케이션(공모 정보)과 네이버 증권(상장일 시세)에서 원본 데이터를 읽는다."""
from __future__ import annotations

import re
import ssl
import time
from datetime import date

import lxml.html
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_38 = "https://www.38.co.kr/html/fund/index.htm"
NAVER_DAY = "https://api.stock.naver.com/chart/domestic/item/{code}/day"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
TIMEOUT = 15
THROTTLE_SEC = 0.4
RETRY = Retry(total=3, backoff_factor=1.5, status_forcelist=[429, 500, 502, 503, 504])


class _LegacyTLS(HTTPAdapter):
    """38.co.kr은 오래된 TLS 암호군을 써서 기본 설정으로는 접속이 거부된다."""

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=0")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


_session = requests.Session()
_session.headers.update(HEADERS)
_session.mount("https://www.38.co.kr", _LegacyTLS(max_retries=RETRY))
_session.mount("https://api.stock.naver.com", HTTPAdapter(max_retries=RETRY))


def _get_38(params: dict) -> lxml.html.HtmlElement:
    time.sleep(THROTTLE_SEC)
    r = _session.get(BASE_38, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return lxml.html.fromstring(r.content.decode("euc-kr", "replace"))


# ── 값 해석 ────────────────────────────────────────────────
def to_int(text) -> int | None:
    m = re.search(r"\d[\d,]*", str(text or ""))
    return int(m.group().replace(",", "")) if m else None


def to_date(text) -> str | None:
    m = re.search(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", str(text or ""))
    return date(int(m[1]), int(m[2]), int(m[3])).isoformat() if m else None


def date_range(text) -> tuple[str | None, str | None]:
    """'2026.12.30~01.02' 또는 '2026.09.16 ~ 2026.09.17' -> ISO 시작일, 종료일"""
    text = str(text or "")
    full = re.findall(r"\d{4}[./-]\d{1,2}[./-]\d{1,2}", text)
    if len(full) >= 2:
        return to_date(full[0]), to_date(full[1])
    m = re.search(r"(\d{4})\.(\d{1,2})\.(\d{1,2})\s*~\s*(\d{1,2})\.(\d{1,2})", text)
    if not m:
        return to_date(text), None
    y, m1, d1, m2, d2 = map(int, m.groups())
    return date(y, m1, d1).isoformat(), date(y + 1 if m2 < m1 else y, m2, d2).isoformat()


def price_band(text) -> tuple[int | None, int | None]:
    nums = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", str(text or ""))]
    return (nums[0], nums[1]) if len(nums) >= 2 else (None, None)


def competition(text) -> str | None:
    m = re.search(r"[\d,.]+\s*:\s*1", str(text or ""))
    return m.group().replace(" ", "") if m else None


def proportional(text) -> str | None:
    m = re.search(r"비례\s*([\d,.]+\s*:\s*1)", str(text or ""))
    return m[1].replace(" ", "") if m else None


def _no_from(tr) -> int | None:
    for a in tr.xpath(".//a[@href]"):
        m = re.search(r"o=v&no=(\d+)", a.get("href"))
        if m:
            return int(m[1])
    return None


def _cells(tr) -> list[str]:
    return [re.sub(r"\s+", " ", td.text_content()).strip() for td in tr.xpath("./td")]


# ── 목록 ────────────────────────────────────────────────
def parse_schedule(doc) -> list[dict]:
    rows = []
    tables = doc.xpath('//table[@summary="공모주 청약일정"]')
    if not tables:
        return rows
    for tr in tables[0].xpath(".//tr"):
        c, no = _cells(tr), _no_from(tr)
        if len(c) >= 6 and no:
            rows.append({"no": no, "name": c[0]})
    return rows


def parse_listings(doc) -> list[dict]:
    rows = []
    tables = doc.xpath('//table[@summary="신규상장종목"]')
    if not tables:
        return rows
    for tr in tables[0].xpath(".//tr"):
        c, no = _cells(tr), _no_from(tr)
        if len(c) < 9 or not no:
            continue
        code = None
        for a in tr.xpath(".//a[@href]"):
            m = re.search(r"code=([0-9A-Z]{6})", a.get("href"))
            if m:
                code = m[1]
        rows.append({"no": no, "name": c[0], "listDate": to_date(c[1]), "code": code,
                     "open38": to_int(c[6]), "close38": to_int(c[8])})
    return rows


def fetch_lists(pages: int) -> tuple[list[dict], list[dict]]:
    schedule, listings = [], []
    for p in range(1, pages + 1):
        schedule += parse_schedule(_get_38({"o": "k", "page": p}))
        listings += parse_listings(_get_38({"o": "nw", "page": p}))
    return schedule, listings


# ── 상세 ────────────────────────────────────────────────
LABELS = {"시장구분", "종목코드", "업종", "확정공모가", "공모청약일", "수요예측일", "배정공고일(신문)",
          "납입일", "환불일", "상장일", "주간사", "청약경쟁률", "희망공모가액", "기관경쟁률",
          "의무보유확약", "총공모주식수"}


def parse_underwriters(rows: list[list[str]], fields: dict) -> list[dict]:
    result, inside = [], False
    for c in rows:
        if c[:2] == ["인수회사", "주식수"]:
            inside = True
            continue
        if inside:
            if len(c) < 3 or c[0] in ("주요일정", ""):
                break
            result.append({"name": c[0], "limit": _max_int(c[2])})
    if result:
        return result
    limit = None
    for c in rows:
        if c and c[0] == "주간사" and len(c) >= 3:
            m = re.search(r"청약한도\s*:\s*([\d,~\s]+)주", c[2])
            limit = _max_int(m[1]) if m else None
            break
    names = [n.strip() for n in fields.get("주간사", "").split(",") if n.strip()]
    return [{"name": n, "limit": limit if len(names) == 1 else None} for n in names]


def _max_int(text) -> int | None:
    nums = [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", str(text or ""))]
    return max(nums) if nums else None


def parse_float(rows: list[list[str]]) -> tuple[int | None, float | None]:
    """주주 표의 합계 행에서 유통가능 주식수와 비율을 읽는다. 앞뒤가 맞지 않으면 None."""
    seen = False
    for c in rows:
        if any("유통가능" in x for x in c):
            seen = True
            continue
        if not (seen and c[0].replace(" ", "") in ("합계", "총계")):
            continue
        nums = []
        for x in c[1:]:
            x = x.replace(",", "").replace("%", "").strip()
            if re.fullmatch(r"\d+(\.\d+)?", x):
                nums.append(float(x))
        # 다른 표의 합계 행도 걸리므로, 주식수/전체 = 비율이 맞는 행만 받아들인다.
        if len(nums) >= 4 and 0 < nums[-1] <= 100 and nums[-2] >= 100 and                 any(n > nums[-2] and abs(nums[-2] / n * 100 - nums[-1]) < 1 for n in nums[:-2]):
            return int(nums[-2]), nums[-1]
    return None, None


def parse_detail(doc, no: int) -> dict:
    rows = [c for c in (_cells(tr) for tr in doc.xpath("//tr")) if c]
    fields: dict[str, str] = {}
    deposit, min_qty = None, None
    for c in rows:
        for i, text in enumerate(c[:-1]):
            if text in LABELS and text not in fields:
                fields[text] = c[i + 1]
        joined = " ".join(c)
        if c[0] == "일반청약자" and deposit is None:
            m = re.search(r"청약증거금율\s*:\s*(\d+)", joined)
            deposit = int(m[1]) if m else None
        if joined.startswith("청약 최고한도") and min_qty is None:
            m = re.search(r"최저\s*:\s*([\d,]+)\s*주", joined)
            min_qty = to_int(m[1]) if m else None

    sub_start, sub_end = date_range(fields.get("공모청약일"))
    demand_start, demand_end = date_range(fields.get("수요예측일"))
    band_low, band_high = price_band(fields.get("희망공모가액"))
    code = re.search(r"\b[0-9A-Z]{6}\b", fields.get("종목코드", ""))
    inst = competition(fields.get("기관경쟁률"))
    float_shares, float_pct = parse_float(rows)
    lockup = re.search(r"[\d.]+", fields.get("의무보유확약", ""))
    return {
        "no": no,
        "market": fields.get("시장구분") or None,
        "code": code.group() if code else None,
        "industry": fields.get("업종") or None,
        "subStart": sub_start,
        "subEnd": sub_end,
        "demandStart": demand_start,
        "demandEnd": demand_end,
        "allocDate": to_date(fields.get("배정공고일(신문)")),
        "payDate": to_date(fields.get("납입일")),
        "refundDate": to_date(fields.get("환불일")),
        "listDate": to_date(fields.get("상장일")),
        "price": to_int(fields.get("확정공모가")),
        "bandLow": band_low,
        "bandHigh": band_high,
        "depositRate": deposit,
        "minQty": min_qty,
        "offerShares": to_int(fields.get("총공모주식수")),
        "underwriters": parse_underwriters(rows, fields),
        "instCompetition": inst,
        # 수요예측 전에는 사이트가 0.00%로 표시하므로 미정으로 둔다.
        "lockupPct": float(lockup.group()) if inst and lockup else None,
        "subCompetition": competition(fields.get("청약경쟁률")),
        "proportional": proportional(fields.get("청약경쟁률")),
        "floatShares": float_shares,
        "floatPct": float_pct,
    }


def fetch_detail(no: int) -> dict:
    return parse_detail(_get_38({"o": "v", "no": no}), no)


# ── 시세 ────────────────────────────────────────────────
def fetch_prices(code: str, day: str) -> dict | None:
    """상장일 하루치 시가·고가·저가·종가. 데이터가 아직 없으면 None."""
    d = day.replace("-", "")
    r = _session.get(NAVER_DAY.format(code=code),
                     params={"startDateTime": d + "0000", "endDateTime": d + "2359"}, timeout=TIMEOUT)
    r.raise_for_status()
    for item in r.json() or []:
        if item.get("localDate") == d and item.get("openPrice"):
            return {"open": int(item["openPrice"]), "high": int(item["highPrice"]),
                    "low": int(item["lowPrice"]), "close": int(item["closePrice"])}
    return None
