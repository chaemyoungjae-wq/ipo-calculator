import { useMemo, useState } from "react";
import { SearchIcon } from "../components/icons";
import { SearchField } from "../components/SearchField";
import { fullDate, ipoStage, matchesName, shortBroker, shortDate, todayIso, type IpoStage } from "../lib/format";
import { useStore } from "../lib/store";
import type { Ipo } from "../types";

const STAGES: { id: IpoStage; label: string; dateHead: string; empty: string }[] = [
  { id: "listed", label: "상장 완료", dateHead: "상장일", empty: "상장을 마친 종목이 없어요." },
  { id: "listing", label: "상장 예정", dateHead: "상장일", empty: "상장을 기다리는 종목이 없어요." },
  { id: "preparing", label: "청약 준비", dateHead: "청약일", empty: "청약을 앞둔 종목이 없어요." },
];

export type StageQueries = Record<IpoStage, string>;

export const EMPTY_STAGE_QUERIES: StageQueries = { listed: "", listing: "", preparing: "" };

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

interface Props {
  onOpen: (no: number) => void;
  stage: IpoStage;
  onStageChange: (stage: IpoStage) => void;
  /** 작은 탭마다 따로 두는 검색어 */
  queries: StageQueries;
  onQueryChange: (stage: IpoStage, query: string) => void;
}

export function UpcomingPage({ onOpen, stage, onStageChange, queries, onQueryChange }: Props) {
  const { data, settings } = useStore();
  // 검색어 없이 검색칸만 연 상태. 검색어가 있으면 항상 열려 있다.
  const [openedEmpty, setOpenedEmpty] = useState<IpoStage | null>(null);
  const today = todayIso();
  const current = STAGES.find((s) => s.id === stage)!;
  const query = queries[stage];
  const searching = query !== "" || openedEmpty === stage;

  const ipos = useMemo(
    () =>
      (data?.ipos ?? [])
        .filter((i) => ipoStage(i, today) === stage && matchesName(i.name, query))
        .sort(compareIn(stage)),
    [data, today, stage, query],
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
            onClick={() => onStageChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className={searching ? "list-head searching" : "list-head"}>
        {searching ? (
          <SearchField
            key={stage}
            value={query}
            autoFocus={openedEmpty === stage}
            onChange={(q) => onQueryChange(stage, q)}
            onClear={() => setOpenedEmpty(null)}
          />
        ) : (
          <button className="head-search" aria-label={`${current.label} 기업명 검색`} onClick={() => setOpenedEmpty(stage)}>
            <span>기업명</span>
            <SearchIcon size={16} />
          </button>
        )}
        <span>{current.dateHead}</span>
      </div>
      {data && ipos.length === 0 && (
        <p className="empty">{query.trim() ? `'${query.trim()}'에 맞는 종목이 없어요.` : current.empty}</p>
      )}
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
