import type { Ipo, Settings, SubRecord } from "../types";
import { computeRecord, type RecordResult } from "./calc";

export interface StatItem {
  record: SubRecord;
  ipo: Ipo;
  date: string;
  result: RecordResult;
}

export interface MonthStat {
  /** YYYY-MM */
  month: string;
  gain: number;
  loss: number;
  net: number;
}

export interface Summary {
  items: StatItem[];
  months: MonthStat[];
  gain: number;
  loss: number;
  net: number;
  invested: number;
  rate: number | null;
  holdingCount: number;
}

export type PeriodKind = "year" | "month" | "custom";

export function periodRange(kind: Exclude<PeriodKind, "custom">, year: number, month: number): [string, string] {
  if (kind === "year") return [`${year}-01-01`, `${year}-12-31`];
  const mm = String(month).padStart(2, "0");
  return [`${year}-${mm}-01`, `${year}-${mm}-${new Date(year, month, 0).getDate()}`];
}

export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > endKey) return result;
    result.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

/** 매도일을 따로 입력하지 않으므로 상장일을 기준으로 기간을 나눈다. */
export function summarize(
  records: SubRecord[],
  ipoByNo: Map<number, Ipo>,
  settings: Settings,
  from: string,
  to: string,
): Summary {
  const items: StatItem[] = [];
  let holdingCount = 0;
  for (const record of records) {
    const ipo = ipoByNo.get(record.ipoNo);
    const date = ipo?.listDate;
    if (!ipo || !date || date < from || date > to) continue;
    const result = computeRecord(record, ipo, settings);
    if (result.status === "holding") holdingCount += 1;
    if (result.status === "sold") items.push({ record, ipo, date, result });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));

  const months = new Map<string, MonthStat>();
  for (const month of monthsBetween(from, to)) months.set(month, { month, gain: 0, loss: 0, net: 0 });
  let gain = 0;
  let loss = 0;
  let invested = 0;
  for (const { date, result } of items) {
    const profit = result.profit ?? 0;
    const stat = months.get(date.slice(0, 7));
    if (profit >= 0) gain += profit;
    else loss += -profit;
    invested += result.invested;
    if (stat) {
      if (profit >= 0) stat.gain += profit;
      else stat.loss += -profit;
      stat.net += profit;
    }
  }
  const net = gain - loss;
  return {
    items,
    months: [...months.values()],
    gain,
    loss,
    net,
    invested,
    rate: invested > 0 ? (net / invested) * 100 : null,
    holdingCount,
  };
}
