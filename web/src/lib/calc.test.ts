import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Ipo, type SubRecord } from "../types";
import { computeRecord, minDeposit } from "./calc";
import { brokerKey, ipoStage, matchesName, monthsAgo, shortBroker } from "./format";
import { monthsBetween, periodRange, summarize } from "./stats";

const ipo: Ipo = { no: 1, name: "테스트", price: 12400, open: 15890, listDate: "2026-11-04", depositRate: 50 };
const record = (over: Partial<SubRecord> = {}): SubRecord => ({
  id: "a",
  ipoNo: 1,
  broker: "대신증권",
  qty: 5,
  sellPrice: 20000,
  ...over,
});

describe("computeRecord", () => {
  it("판매금액에서 공모금액, 청약수수료, 세금과 매도 수수료를 뺀다", () => {
    const r = computeRecord(record(), ipo, DEFAULT_SETTINGS);
    expect(r.status).toBe("sold");
    expect(r.sellCost).toBe(215); // 거래세 200 + 수수료 15
    expect(r.profit).toBe(35785); // 100,000 - 62,000 - 2,000 - 215
    expect(r.rate).toBeCloseTo(57.72, 2);
  });

  it("판매가가 비어 있으면 시초가를 쓴다", () => {
    expect(computeRecord(record({ sellPrice: null }), ipo, DEFAULT_SETTINGS).sellPrice).toBe(15890);
  });

  it("판매가 0원은 보유중이고 수익에 넣지 않는다", () => {
    const r = computeRecord(record({ sellPrice: 0 }), ipo, DEFAULT_SETTINGS);
    expect(r.status).toBe("holding");
    expect(r.profit).toBeNull();
  });

  it("배정수량 0주는 미배정이다", () => {
    expect(computeRecord(record({ qty: 0 }), ipo, DEFAULT_SETTINGS).status).toBe("unallocated");
  });

  it("상장 전에는 수익을 계산하지 않는다", () => {
    const r = computeRecord(record({ sellPrice: null }), { ...ipo, open: undefined }, DEFAULT_SETTINGS);
    expect(r.status).toBe("pending");
  });

  it("수수료 면제 증권사는 청약수수료가 0원이다", () => {
    const settings = { ...DEFAULT_SETTINGS, feeFreeBrokers: ["대신증권"] };
    expect(computeRecord(record(), ipo, settings).profit).toBe(37785);
  });

  it("증권사별 청약수수료를 우선한다", () => {
    const settings = { ...DEFAULT_SETTINGS, brokerSubFee: { 대신증권: 1500 } };
    expect(computeRecord(record(), ipo, settings).subFee).toBe(1500);
  });
});

describe("minDeposit", () => {
  it("확정 공모가 기준으로 계산한다", () => {
    expect(minDeposit(ipo, "대신증권", DEFAULT_SETTINGS)).toEqual({ amount: 62000, qty: 10, estimated: false });
  });

  it("공모가 확정 전에는 희망공모가 상단으로 추정한다", () => {
    const d = minDeposit({ no: 2, name: "x", bandHigh: 13000, depositRate: 50 }, "KB증권", DEFAULT_SETTINGS);
    expect(d).toEqual({ amount: 65000, qty: 10, estimated: true });
  });
});

describe("stats", () => {
  it("연도와 월의 범위를 만든다", () => {
    expect(periodRange("year", 2026, 1)).toEqual(["2026-01-01", "2026-12-31"]);
    expect(periodRange("month", 2024, 2)).toEqual(["2024-02-01", "2024-02-29"]);
  });

  it("3개월 전 날짜를 구한다", () => {
    expect(monthsAgo("2026-11-08", 3)).toBe("2026-08-08");
    expect(monthsAgo("2026-01-15", 3)).toBe("2025-10-15");
    expect(monthsAgo("2026-05-31", 3)).toBe("2026-02-28");
  });

  it("연도를 넘어가는 월 목록을 만든다", () => {
    expect(monthsBetween("2025-11-15", "2026-01-02")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("수익과 손실을 나누어 합하고 차익을 구한다", () => {
    const ipos = new Map<number, Ipo>([
      [1, ipo],
      [2, { ...ipo, no: 2, price: 20000, open: 10000, listDate: "2026-11-20" }],
      [3, { ...ipo, no: 3, listDate: "2027-01-05" }],
    ]);
    const records = [
      record(),
      record({ id: "b", ipoNo: 2, qty: 1, sellPrice: null }),
      record({ id: "c", ipoNo: 1, sellPrice: 0 }),
      record({ id: "d", ipoNo: 3 }),
    ];
    const s = summarize(records, ipos, DEFAULT_SETTINGS, "2026-11-01", "2026-11-30");
    // 2번: 10,000 - 20,000 - 2,000 - (20 + 1) = -12,021
    expect(s.gain).toBe(35785);
    expect(s.loss).toBe(12021);
    expect(s.net).toBe(23764);
    expect(s.months).toEqual([{ month: "2026-11", gain: 35785, loss: 12021, net: 23764 }]);
    expect(s.holdingCount).toBe(1);
    expect(s.items).toHaveLength(2);
  });
});

describe("ipoStage", () => {
  const today = "2026-11-08";

  it("상장일이 오늘이거나 지났으면 상장 완료다", () => {
    expect(ipoStage({ listDate: "2026-11-08", subEnd: "2026-10-30" }, today)).toBe("listed");
  });

  it("청약이 끝나고 상장 전이면 상장 예정이다", () => {
    expect(ipoStage({ listDate: "2026-11-17", subEnd: "2026-11-06" }, today)).toBe("listing");
    expect(ipoStage({ subEnd: "2026-11-07" }, today)).toBe("listing");
  });

  it("청약 중이거나 청약 전이면 청약 준비다", () => {
    expect(ipoStage({ subEnd: "2026-11-08" }, today)).toBe("preparing");
    expect(ipoStage({ subEnd: "2026-12-10" }, today)).toBe("preparing");
    expect(ipoStage({}, today)).toBe("preparing");
  });
});

describe("matchesName", () => {
  it("대소문자와 띄어쓰기를 무시한다", () => {
    expect(matchesName("KB스팩34호", "kb 스팩")).toBe(true);
    expect(matchesName("영광(구.영광공작소)", "공작소")).toBe(true);
  });

  it("검색어가 비어 있으면 모두 보인다", () => {
    expect(matchesName("이에스티", "")).toBe(true);
    expect(matchesName("이에스티", "  ")).toBe(true);
  });

  it("들어 있지 않으면 걸러낸다", () => {
    expect(matchesName("이에스티", "인텔")).toBe(false);
  });
});

describe("broker names", () => {
  it("같은 증권사의 다른 표기를 하나로 합친다", () => {
    expect(brokerKey("유진증권")).toBe("유진투자증권");
    expect(brokerKey(" KB증권 ")).toBe("KB증권");
  });

  it("짧은 이름을 만든다", () => {
    expect(shortBroker("신한투자증권")).toBe("신한");
    expect(shortBroker("한국투자증권")).toBe("한국투자");
    expect(shortBroker("KB증권")).toBe("KB");
  });
});
