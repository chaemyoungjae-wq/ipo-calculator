import { useMemo, useState } from "react";
import { ProfitChart } from "../components/ProfitChart";
import { monthsAgo, shortBroker, shortDate, signedPct, signedWon, todayIso, toneOf, won } from "../lib/format";
import { periodRange, stepMonth, summarize, yearOptions, type PeriodKind } from "../lib/stats";
import { StepSelect } from "../components/StepSelect";

const MONTH_CHOICES = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` }));
import { useStore } from "../lib/store";

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: "year", label: "연도별" },
  { id: "month", label: "월별" },
  { id: "custom", label: "지정" },
];

export function ProfitPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { records, ipoByNo, settings } = useStore();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));

  const years = useMemo(() => {
    const recordYears = records.flatMap((r) => {
      const date = ipoByNo.get(r.ipoNo)?.listDate;
      return date ? [Number(date.slice(0, 4))] : [];
    });
    return yearOptions(recordYears, thisYear);
  }, [records, ipoByNo, thisYear]);

  const [kind, setKind] = useState<PeriodKind>("year");
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonth);
  const [from, setFrom] = useState(() => monthsAgo(today, 3));
  const [to, setTo] = useState(today);

  const yearChoices = years.map((y) => ({ value: y, label: `${y}년` }));
  const minYear = years[years.length - 1];
  const maxYear = years[0];
  const moveMonth = (delta: number) => {
    const next = stepMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  };

  const [rangeFrom, rangeTo] = kind === "custom" ? [from, to] : periodRange(kind, year, month);
  const invalidRange = kind === "custom" && (!from || !to || from > to);

  const summary = useMemo(
    () => summarize(records, ipoByNo, settings, invalidRange ? "9" : rangeFrom, invalidRange ? "0" : rangeTo),
    [records, ipoByNo, settings, rangeFrom, rangeTo, invalidRange],
  );

  return (
    <section className="profit">
      <div className="segment" role="group" aria-label="기간 단위">
        {KINDS.map((k) => (
          <button key={k.id} aria-pressed={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="period-row">
        {kind === "custom" ? (
          <>
            <input type="date" aria-label="시작일" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>~</span>
            <input type="date" aria-label="종료일" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : (
          kind === "year" ? (
            <StepSelect
              label="연도"
              value={year}
              options={yearChoices}
              onChange={setYear}
              onPrev={() => setYear(year - 1)}
              onNext={() => setYear(year + 1)}
              prevDisabled={year <= minYear}
              nextDisabled={year >= maxYear}
              prevLabel="이전 연도"
              nextLabel="다음 연도"
            />
          ) : (
            <>
              <select className="year-select" aria-label="연도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearChoices.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <StepSelect
                label="월"
                value={month}
                options={MONTH_CHOICES}
                onChange={setMonth}
                onPrev={() => moveMonth(-1)}
                onNext={() => moveMonth(1)}
                prevDisabled={year <= minYear && month === 1}
                nextDisabled={year >= maxYear && month === 12}
                prevLabel="이전 달"
                nextLabel="다음 달"
              />
            </>
          )
        )}
      </div>
      {invalidRange && <p className="notice inline">시작일이 종료일보다 늦어요.</p>}

      <div className="hero">
        <div>
          <span className="hero-label">손익</span>
          <strong className={`hero-value num ${toneOf(summary.net)}`}>{signedWon(summary.net)}</strong>
        </div>
        <div className="hero-side">
          <span className="hero-label">수익률</span>
          <strong className={`hero-rate num ${toneOf(summary.rate)}`}>
            {summary.rate !== null ? signedPct(summary.rate) : "-"}
          </strong>
        </div>
      </div>

      {summary.items.length > 0 ? (
        <>
          <ProfitChart key={`${rangeFrom}-${rangeTo}`} months={summary.months} />
          <h3 className="section-title">종목별 수익</h3>
          <ul className="list">
            {summary.items.map(({ record, ipo, date, result }) => (
              <li key={record.id}>
                <button className="row" onClick={() => onOpen(record.id)}>
                  <span className="row-main">
                    <span className="row-title">{ipo.name}</span>
                    <span className="row-sub">
                      {shortDate(date)} · {shortBroker(record.broker)} · {record.qty}주 · 공모금액 {won(result.invested)}
                    </span>
                  </span>
                  <span className="row-side num">
                    <strong className={toneOf(result.profit)}>{signedWon(result.profit ?? 0)}</strong>
                    <small className={toneOf(result.rate)}>{signedPct(result.rate ?? 0)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty">이 기간에 판매한 종목이 없어요.</p>
      )}
      {summary.holdingCount > 0 && <p className="hint">보유중 {summary.holdingCount}건은 합계에서 빠져 있어요.</p>}
      <p className="hint">기간은 상장일을 기준으로 나눠요. 세금과 수수료를 뺀 금액이에요.</p>
    </section>
  );
}
