import { describe, expect, it } from "vitest";
import type { SubRecord } from "../types";
import { recordFromDoc, recordsToUpload } from "./sync";

const rec = (id: string, ipoNo: number, broker: string, qty = 0, sellPrice: number | null = null): SubRecord => ({
  id,
  ipoNo,
  broker,
  qty,
  sellPrice,
});

describe("recordsToUpload", () => {
  it("계정에 없는 기록만 올린다", () => {
    const local = [rec("a", 1, "KB증권", 2), rec("b", 2, "NH투자증권", 1)];
    const cloud = [rec("x", 1, "KB증권", 5)];
    expect(recordsToUpload(local, cloud)).toEqual([rec("b", 2, "NH투자증권", 1)]);
  });

  it("같은 종목도 증권사가 다르면 다른 기록이다", () => {
    expect(recordsToUpload([rec("a", 1, "KB증권")], [rec("x", 1, "NH투자증권")])).toHaveLength(1);
  });

  it("계정 값이 있으면 덮어쓰지 않는다", () => {
    expect(recordsToUpload([rec("a", 1, "KB증권", 9, 100)], [rec("x", 1, "KB증권", 2, 50)])).toEqual([]);
  });

  it("계정 값이 비어 있으면 이 기기 값으로 채우고 문서는 하나만 유지한다", () => {
    expect(recordsToUpload([rec("a", 1, "KB증권", 3, 500)], [rec("x", 1, "KB증권")])).toEqual([
      rec("x", 1, "KB증권", 3, 500),
    ]);
  });

  it("이 기기 안의 중복은 한 번만 올린다", () => {
    expect(recordsToUpload([rec("a", 1, "KB증권"), rec("b", 1, "KB증권")], [])).toHaveLength(1);
  });

  it("두 번 실행해도 다시 올리지 않는다", () => {
    const local = [rec("a", 1, "KB증권", 2)];
    expect(recordsToUpload(local, recordsToUpload(local, []))).toEqual([]);
  });
});

describe("recordFromDoc", () => {
  it("문서를 기록으로 바꾼다", () => {
    expect(recordFromDoc("a", { ipoNo: 1, broker: "KB증권", qty: 2, sellPrice: 0 })).toEqual(rec("a", 1, "KB증권", 2, 0));
    expect(recordFromDoc("a", { ipoNo: 1, broker: "KB증권", qty: 2, sellPrice: null })?.sellPrice).toBeNull();
  });

  it("형식이 맞지 않으면 버린다", () => {
    expect(recordFromDoc("a", { ipoNo: "1", broker: "KB증권", qty: 2 })).toBeNull();
  });
});
