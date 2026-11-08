import { useMemo, useState } from "react";
import { fullDate, ipoStage, shortBroker, shortDate, todayIso, type IpoStage } from "../lib/format";
import { useStore } from "../lib/store";
import type { Ipo } from "../types";

const STAGES: { id: IpoStage; label: string; dateHead: string; empty: string }[] = [
  { id: "listed", label: "상장 완료", dateHead: "상장일", empty: "상장을 마친 종목이 없어요." },
  { id: "listing", label: "상장 예정", dateHead: "상장일", empty: "상장을 기다리는 종목이 없어요." },
  { id: "preparing", label: "청약 준비", dateHead: "청약일", empty: "청약을 앞둔 종목이 없어요." },
];

function compareIn(stage: IpoStage) {
  return (a: Ipo, b: Ipo) => {
    if (stage === "listed") return (b.listDate ?? "").localeCompare(a.listDate ?? "");
    if (stage === "listing") return (a.listDate ?? "9").localeCompare(b.listDate ?? "9");
    return (a.subStart ?? "9").localeCompare(b.subStart ?? "9");
  };
}

function dateLabel(ipo: Ipo, stage: IpoStage): string {
  if (stage !== "preparing") return fullDate(ipo.listDate) || "미정";
  const start = shortDate(ipo.subStart);
  const end = shortDate(ipo.subEnd);
  return start && end ? `${start} ~ ${end}` : start || "미정";
}

export function UpcomingPage({ onOpen }: { onOpen: (no: number) => void }) {
  const { data, settings } = useStore();
  const [stage, setStage] = useState<IpoStage>("preparing");
  const today = todayIso();
  const current = STAGES.find((s) => s.id === stage)!;

  const ipos = useMemo(
    () => (data?.ipos ?? []).filter((i) => ipoStage(i, today) === stage).sort(compareIn(stage)),
    [data, today, stage],
  );

  return (
    <section>
      <div className="subtabs" role="tablist" aria-label="진행 단계">
        {STAGES.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={stage === s.id}
            className={stage === s.id ? "subtab on" : "subtab"}
            onClick={() => setStage(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="list-head">
        <span>기업명</span>
        <span>{current.dateHead}</span>
      </div>
      {data && ipos.length === 0 && <p className="empty">{current.empty}</p>}
      <ul className="list">
        {ipos.map((ipo) => {
          const brokers = ipo.underwriters ?? [];
          const mine = brokers.some((u) => settings.myBrokers.includes(u.name));
          const live = !!ipo.subStart && !!ipo.subEnd && ipo.subStart <= today && today <= ipo.subEnd;
          return (
            <li key={ipo.no}>
              <button className="row" onClick={() => onOpen(ipo.no)}>
                <span className="row-main">
                  <span className="row-title">
                    {ipo.name}
                    {live && <em className="tag live">청약중</em>}
                  </span>
                  <span className="row-sub">
                    {brokers.map((u) => shortBroker(u.name)).join(", ")}
                    {mine && <em className="tag">내 증권사</em>}
                  </span>
                </span>
                <span className="row-side num">{dateLabel(ipo, stage)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
