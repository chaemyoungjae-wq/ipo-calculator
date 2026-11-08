import type { SubRecord } from "../types";

const sameSubscription = (a: SubRecord, b: SubRecord) => a.ipoNo === b.ipoNo && a.broker === b.broker;

const isBlank = (r: SubRecord) => r.qty === 0 && r.sellPrice === null;

/**
 * 처음 로그인할 때 이 기기 기록 중 계정에 올릴 것을 고른다.
 * 같은 종목·증권사가 이미 계정에 있으면 계정 값을 지키되, 계정 쪽이 아직 비어 있으면
 * 이 기기에서 입력한 값으로 채운다. 여러 번 실행해도 결과가 같다.
 */
export function recordsToUpload(local: SubRecord[], cloud: SubRecord[]): SubRecord[] {
  const uploads: SubRecord[] = [];
  for (const record of local) {
    if (uploads.some((u) => sameSubscription(u, record))) continue;
    const existing = cloud.find((c) => sameSubscription(c, record));
    if (!existing) uploads.push(record);
    else if (isBlank(existing) && !isBlank(record)) uploads.push({ ...record, id: existing.id });
  }
  return uploads;
}

/** Firestore 문서를 앱 기록으로 바꾼다. 형식이 맞지 않으면 null. */
export function recordFromDoc(id: string, data: Record<string, unknown>): SubRecord | null {
  const { ipoNo, broker, qty, sellPrice } = data;
  if (typeof ipoNo !== "number" || typeof broker !== "string" || typeof qty !== "number") return null;
  return { id, ipoNo, broker, qty, sellPrice: typeof sellPrice === "number" ? sellPrice : null };
}
