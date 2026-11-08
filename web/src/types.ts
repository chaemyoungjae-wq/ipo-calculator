export interface Underwriter {
  name: string;
  limit?: number | null;
}

/** 수집기가 만드는 공모주 한 건. 아직 정해지지 않은 값은 없을 수 있다. */
export interface Ipo {
  no: number;
  name: string;
  market?: string;
  code?: string;
  industry?: string;
  subStart?: string;
  subEnd?: string;
  allocDate?: string;
  refundDate?: string;
  listDate?: string;
  price?: number;
  bandLow?: number;
  bandHigh?: number;
  depositRate?: number;
  minQty?: number;
  underwriters?: Underwriter[];
  instCompetition?: string;
  lockupPct?: number;
  subCompetition?: string;
  proportional?: string;
  floatShares?: number;
  floatPct?: number;
  open?: number;
  high?: number;
  close?: number;
  priceCheck?: boolean;
}

export interface IpoData {
  updatedAt: string;
  warnings: string[];
  ipos: Ipo[];
}

export interface Settings {
  myBrokers: string[];
  feeFreeBrokers: string[];
  /** 증권거래세(%) */
  taxRate: number;
  /** 매도 수수료(%) */
  sellFeeRate: number;
  defaultSubFee: number;
  brokerSubFee: Record<string, number>;
  defaultMinQty: number;
  brokerMinQty: Record<string, number>;
}

export interface SubRecord {
  id: string;
  ipoNo: number;
  broker: string;
  /** 0이면 미배정 */
  qty: number;
  /** null이면 시초가를 따라감, 0이면 보유중 */
  sellPrice: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  myBrokers: [],
  feeFreeBrokers: [],
  taxRate: 0.2,
  sellFeeRate: 0.015,
  defaultSubFee: 2000,
  brokerSubFee: {},
  defaultMinQty: 10,
  brokerMinQty: {},
};
