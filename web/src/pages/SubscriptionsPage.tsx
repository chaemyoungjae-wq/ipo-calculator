import { useMemo, useState } from "react";
import { computeRecord } from "../lib/calc";
import { fullDate, shortBroker, signedPct, todayIso, toneOf } from "../lib/format";
import { useStore } from "../lib/store";
import type { Ipo, SubRecord } from "../types";

function pastLabel(record: SubRecord, ipo: Ipo | undefined, settings: Parameters<typeof computeRecord>[2]) {
  const r = computeRecord(record, ipo, settings);
  if (r.status === "sold" && r.rate !== null) return { text: signedPct(r.rate), tone: toneOf(r.rate) };
  if (r.status === "holding") return { text: "보유중", tone: "" };
  if (r.status === "unallocated") return { text: "수량 입력", tone: "" };
  return { text: "시세 대기", tone: "" };
}

export function SubscriptionsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { records, ipoByNo, settings } = useStore();
  const [holdingOnly, setHoldingOnly] = useState(false);
  const today = todayIso();

  const { past, upcoming } = useMemo(() => {
    const withIpo = records.map((record) => ({ record, ipo: ipoByNo.get(record.ipoNo) }));
    const isPast = (x: { ipo?: Ipo }) => !!x.ipo?.listDate && x.ipo.listDate <= today;
    return {
      // 지난 청약은 최근 상장한 종목부터
      past: withIpo.filter(isPast).sort((a, b) => b.ipo!.listDate!.localeCompare(a.ipo!.listDate!)),
      // 상장 예정은 가까운 순, 상장일 미정은 맨 아래
      upcoming: withIpo
        .filter((x) => !isPast(x))
        .sort((a, b) => (a.ipo?.listDate ?? "9").localeCompare(b.ipo?.listDate ?? "9")),
    };
  }, [records, ipoByNo, today]);

  const holdings = past.filter((x) => computeRecord(x.record, x.ipo, settings).status === "holding");

  const tools = (
    <div className="list-tools">
      <label className="check">
        <input type="checkbox" checked={holdingOnly} onChange={(e) => setHoldingOnly(e.target.checked)} />
        <span>보유중 주식 보기</span>
      </label>
    </div>
  );

  if (records.length === 0) {
    return (
      <section>
        {tools}
        <p className="empty">아직 청약 기록이 없어요. 청약 정보 탭에서 종목을 눌러 청약하기를 선택하세요.</p>
      </section>
    );
  }

  const renderPast = (list: typeof past) => (
    <ul className="list">
      {list.map(({ record, ipo }) => {
        const label = pastLabel(record, ipo, settings);
        return (
          <li key={record.id}>
            <button className="row" onClick={() => onOpen(record.id)}>
              <span className="row-main">
                <span className="row-title">{ipo?.name ?? `종목 ${record.ipoNo}`}</span>
                <span className="row-sub">
                  {shortBroker(record.broker)} · {record.qty}주
                </span>
              </span>
              <span className={`row-side num strong ${label.tone}`}>{label.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (holdingOnly) {
    return (
      <section>
        {tools}
        {holdings.length === 0 ? <p className="empty">보유중인 주식이 없어요.</p> : renderPast(holdings)}
      </section>
    );
  }

  return (
    <section>
      {tools}
      <div className="list-head">
        <span>상장 예정</span>
        <span>상장일</span>
      </div>
      {upcoming.length === 0 && <p className="empty small">상장을 기다리는 종목이 없어요.</p>}
      <ul className="list">
        {upcoming.map(({ record, ipo }) => (
          <li key={record.id}>
            <button className="row" onClick={() => onOpen(record.id)}>
              <span className="row-main">
                <span className="row-title">{ipo?.name ?? `종목 ${record.ipoNo}`}</span>
                <span className="row-sub">{shortBroker(record.broker)}</span>
              </span>
              <span className="row-side num">{fullDate(ipo?.listDate) || "미정"}</span>
            </button>
          </li>
        ))}
      </ul>
      {past.length > 0 && (
        <>
          <div className="list-head spaced">
            <span>지난 청약</span>
            <span>수익률</span>
          </div>
          {renderPast(past)}
        </>
      )}
    </section>
  );
}
