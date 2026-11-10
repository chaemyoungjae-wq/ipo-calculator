const ALIASES: Record<string, string> = {
  유진증권: "유진투자증권",
  iM증권: "아이엠증권",
};

export const COMMON_BROKERS = [
  "KB증권", "우리투자증권", "신한투자증권", "한국투자증권", "NH투자증권", "미래에셋증권",
  "삼성증권", "키움증권", "대신증권", "하나증권", "유안타증권", "IBK투자증권",
  "SK증권", "교보증권", "DB증권", "BNK투자증권", "한화투자증권", "현대차증권",
  "메리츠증권", "LS증권", "신영증권", "유진투자증권", "아이엠증권",
];

export function brokerKey(name: string): string {
  const trimmed = name.trim();
  return ALIASES[trimmed] ?? trimmed;
}

export function shortBroker(name: string): string {
  if (name === "한국투자증권") return "한국투자";
  return name.replace(/투자증권$|증권$/, "");
}

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${won(Math.abs(n))}`;

export const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}%`;

export const toneOf = (n: number | null | undefined) => (!n ? "" : n > 0 ? "up" : "down");

/** 2026-11-05 -> 11.05 */
export const shortDate = (iso?: string) => (iso ? `${iso.slice(5, 7)}.${iso.slice(8, 10)}` : "");

/** 2026-11-05 -> 2026.11.05 */
export const fullDate = (iso?: string) => (iso ? iso.replaceAll("-", ".") : "");

export function dateRange(start?: string, end?: string): string {
  if (!start) return "미정";
  if (!end || end === start) return fullDate(start);
  return `${fullDate(start)} ~ ${shortDate(end)}`;
}

export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 같은 날짜의 n개월 전. 그 달에 없는 날이면 말일로 맞춘다. (5월 31일의 3개월 전 -> 2월 28일) */
export function monthsAgo(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(year, month - 1 - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return todayIso(target);
}

export type IpoStage = "listed" | "listing" | "preparing";

/** 상장일이 지났으면 상장 완료, 청약이 끝났으면 상장 예정, 그 전은 청약 준비(청약 중 포함). */
export function ipoStage(ipo: { listDate?: string; subEnd?: string }, today: string): IpoStage {
  if (ipo.listDate && ipo.listDate <= today) return "listed";
  if (ipo.subEnd && ipo.subEnd < today) return "listing";
  return "preparing";
}

const squash = (text: string) => text.replace(/\s+/g, "").toLowerCase();

/** 대소문자와 띄어쓰기를 무시하고 기업명에 검색어가 들어 있는지 본다. 검색어가 비어 있으면 모두 통과. */
export function matchesName(name: string, query: string): boolean {
  const q = squash(query);
  return !q || squash(name).includes(q);
}

/** 입력칸의 문자열에서 숫자만 읽는다. 비어 있으면 null. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}
