import { useMemo } from "react";
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
  /** 내 증권사가 주간사인 종목만 보기. 작은 탭 사이에서 함께 쓴다. */
  myBrokersOnly: boolean;
  onMyBrokersOnlyChange: (value: boolean) => void;
}

export function UpcomingPage(props: Props) {
  const { onOpen, stage, onStageChange, queries, onQueryChange, myBrokersOnly, onMyBrokersOnlyChange } = props;
  const { data, settings } = useStore();
  const today = todayIso();
  const current = STAGES.find((s) => s.id === stage)!;
  const query = queries[stage];
  const isMine = (ipo: Ipo) => (ipo.underwriters ?? []).some((u) => settings.myBrokers.includes(u.name));

  const ipos = useMemo(
    () =>
      (data?.ipos ?? [])
        .filter((i) => ipoStage(i, today) === stage && matchesName(i.name, query) && (!myBrokersOnly || isMine(i)))
        .sort(compareIn(stage)),
    // isMine은 settings.myBrokers에만 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, today, stage, query, myBrokersOnly, settings.myBrokers],
  );

  const searched = query.trim();
  const emptyText =
    myBrokersOnly && settings.myBrokers.length === 0
      ? "왼쪽 메뉴(☰)에서 내 증권사를 먼저 골라 주세요."
      : searched
        ? `'${searched}'에 맞는 종목이 없어요.`
        : myBrokersOnly
          ? "내 증권사가 맡은 종목이 없어요."
          : current.empty;

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
      <div className="list-tools">
        <SearchField key={stage} value={query} onChange={(q) => onQueryChange(stage, q)} />
        <label className="check">
          <input type="checkbox" checked={myBrokersOnly} onChange={(e) => onMyBrokersOnlyChange(e.target.checked)} />
          <span>보유 증권사 보기</span>
        </label>
      </div>
      <div className="list-head">
        <span>기업명</span>
        <span>{current.dateHead}</span>
      </div>
      {data && ipos.length === 0 && <p className="empty">{emptyText}</p>}
      <ul className="list">
        {ipos.map((ipo) => {
          const brokers = ipo.underwriters ?? [];
          const mine = isMine(ipo);
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
