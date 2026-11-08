import { useState } from "react";
import { minDeposit } from "../lib/calc";
import { dateRange, fullDate, shortBroker, won } from "../lib/format";
import { useStore } from "../lib/store";
import type { Ipo } from "../types";
import { Sheet } from "./Sheet";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function priceText(ipo: Ipo): string {
  if (ipo.price) return won(ipo.price);
  if (ipo.bandLow && ipo.bandHigh) return `${ipo.bandLow.toLocaleString("ko-KR")} ~ ${won(ipo.bandHigh)} (희망)`;
  return "미정";
}

function competitionText(ipo: Ipo): string {
  if (!ipo.instCompetition && !ipo.subCompetition) return "미정";
  const parts = [];
  if (ipo.instCompetition) parts.push(`기관 ${ipo.instCompetition}`);
  if (ipo.subCompetition) parts.push(`청약 ${ipo.subCompetition}`);
  if (ipo.proportional) parts.push(`비례 ${ipo.proportional}`);
  return parts.join(" · ");
}

function floatText(ipo: Ipo): string {
  if (!ipo.floatShares) return "확인 불가";
  return `${ipo.floatShares.toLocaleString("ko-KR")}주 (${ipo.floatPct}%)`;
}

export function IpoDetail({ ipoNo, onClose, onToast }: { ipoNo: number; onClose: () => void; onToast: (m: string) => void }) {
  const { ipoByNo, settings, records, addRecord } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const ipo = ipoByNo.get(ipoNo);
  if (!ipo) return null;

  const underwriters = [...(ipo.underwriters ?? [])].sort(
    (a, b) => Number(settings.myBrokers.includes(b.name)) - Number(settings.myBrokers.includes(a.name)),
  );
  const taken = new Set(records.filter((r) => r.ipoNo === ipoNo).map((r) => r.broker));

  const subscribe = (broker: string) => {
    addRecord(ipoNo, broker);
    onToast(`${ipo.name}을(를) 내 청약에 추가했어요`);
    onClose();
  };
  const onlyBroker = underwriters.length === 1 ? underwriters[0].name : null;
  const alreadyDone = onlyBroker !== null && taken.has(onlyBroker);

  const toggle = (
    <button className="pill" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
      {expanded ? "접기" : "자세히"}
    </button>
  );

  return (
    <Sheet title={ipo.name} aside={toggle} onClose={onClose}>
      {expanded && (
        <dl className="info expanded">
          <Row label="경쟁률" value={competitionText(ipo)} />
          <Row label="의무보유 확약" value={ipo.lockupPct != null ? `${ipo.lockupPct}%` : "미정"} />
          <Row label="유통가능 주식" value={floatText(ipo)} />
          <Row label="업종" value={ipo.industry ?? "확인 불가"} />
        </dl>
      )}
      <dl className="info">
        <Row label="공모가" value={priceText(ipo)} />
        <Row label="공모 일정" value={dateRange(ipo.subStart, ipo.subEnd)} />
        <Row label="배정·환불" value={fullDate(ipo.refundDate ?? ipo.allocDate) || "미정"} />
        <Row label="상장일" value={fullDate(ipo.listDate) || "미정"} />
      </dl>

      <h3 className="section-title">증권사별 최소 청약증거금</h3>
      {underwriters.length === 0 && <p className="hint">주간사 정보가 아직 없어요.</p>}
      <ul className="deposit-list">
        {underwriters.map((u) => {
          const deposit = minDeposit(ipo, u.name, settings);
          const mine = settings.myBrokers.includes(u.name);
          return (
            <li key={u.name}>
              <span className={mine ? "strong" : ""}>
                {shortBroker(u.name)}
                {mine && <em className="tag">내 증권사</em>}
              </span>
              <span className="num">
                {deposit ? won(deposit.amount) : "미정"}
                {deposit && (
                  <small>
                    {deposit.qty}주 기준{deposit.estimated ? " · 예상" : ""}
                  </small>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {picking ? (
        <div className="picker">
          <h3 className="section-title">어느 증권사로 청약하셨나요?</h3>
          {underwriters.map((u) => (
            <button
              key={u.name}
              className="btn"
              disabled={taken.has(u.name)}
              onClick={() => subscribe(u.name)}
            >
              {shortBroker(u.name)}
              {taken.has(u.name) ? " (청약함)" : ""}
            </button>
          ))}
        </div>
      ) : (
        <button
          className="btn primary wide"
          disabled={underwriters.length === 0 || alreadyDone}
          onClick={() => (onlyBroker ? subscribe(onlyBroker) : setPicking(true))}
        >
          {alreadyDone ? "청약함" : "청약하기"}
        </button>
      )}
    </Sheet>
  );
}
