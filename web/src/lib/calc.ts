import type { Ipo, Settings, SubRecord } from "../types";

export type RecordStatus = "unallocated" | "pending" | "holding" | "sold";

export interface RecordResult {
  status: RecordStatus;
  /** 실제 계산에 쓰인 판매가 (사용자 입력 또는 시초가) */
  sellPrice: number | null;
  invested: number;
  proceeds: number;
  subFee: number;
  sellCost: number;
  profit: number | null;
  rate: number | null;
}

export function subFeeFor(broker: string, settings: Settings): number {
  if (settings.feeFreeBrokers.includes(broker)) return 0;
  return settings.brokerSubFee[broker] ?? settings.defaultSubFee;
}

export function computeRecord(record: SubRecord, ipo: Ipo | undefined, settings: Settings): RecordResult {
  const qty = record.qty;
  const price = ipo?.price ?? 0;
  const sellPrice = record.sellPrice ?? ipo?.open ?? null;
  const base: RecordResult = {
    status: "pending",
    sellPrice,
    invested: price * qty,
    proceeds: 0,
    subFee: 0,
    sellCost: 0,
    profit: null,
    rate: null,
  };
  if (qty <= 0) return { ...base, status: "unallocated" };
  if (sellPrice === 0) return { ...base, status: "holding" };
  if (sellPrice === null || price <= 0) return base;

  const proceeds = sellPrice * qty;
  const subFee = subFeeFor(record.broker, settings);
  const sellCost =
    Math.floor((proceeds * settings.taxRate) / 100) + Math.floor((proceeds * settings.sellFeeRate) / 100);
  const profit = proceeds - price * qty - subFee - sellCost;
  return { ...base, status: "sold", proceeds, subFee, sellCost, profit, rate: (profit / (price * qty)) * 100 };
}

export interface MinDeposit {
  amount: number;
  qty: number;
  /** 공모가가 확정되지 않아 희망공모가 상단으로 계산한 값 */
  estimated: boolean;
}

/** 최소 청약증거금 = 공모가 × 최소 청약수량 × 증거금율 */
export function minDeposit(ipo: Ipo, broker: string, settings: Settings): MinDeposit | null {
  const price = ipo.price ?? ipo.bandHigh;
  if (!price) return null;
  const qty = ipo.minQty ?? settings.brokerMinQty[broker] ?? settings.defaultMinQty;
  const rate = ipo.depositRate ?? 50;
  return { amount: (price * qty * rate) / 100, qty, estimated: !ipo.price };
}
