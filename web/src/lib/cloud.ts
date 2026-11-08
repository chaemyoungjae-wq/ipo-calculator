/** Firebase 로그인과 기록 저장. 앱 시작을 늦추지 않도록 store에서 동적으로 불러온다. */
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  terminate,
  waitForPendingWrites,
  writeBatch,
  type WriteBatch,
} from "firebase/firestore";
import type { Settings, SubRecord } from "../types";
import { firebaseConfig, USE_EMULATOR } from "./firebaseConfig";
import { recordFromDoc, recordsToUpload } from "./sync";

export type SyncStatus = "synced" | "pending" | "offline";

const BATCH_LIMIT = 400;
const LOGOUT_WAIT_MS = 5000;

const app = initializeApp(firebaseConfig!);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const recordsCol = (uid: string) => collection(db, "users", uid, "records");
const recordDoc = (uid: string, id: string) => doc(db, "users", uid, "records", id);
const settingsDoc = (uid: string) => doc(db, "users", uid, "meta", "settings");

const recordData = ({ ipoNo, broker, qty, sellPrice }: SubRecord) => ({ ipoNo, broker, qty, sellPrice });

export function watchAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "로그인 창이 닫혔어요.",
  "auth/cancelled-popup-request": "로그인 창이 닫혔어요.",
  "auth/popup-blocked": "로그인 창이 차단됐어요. 브라우저에서 팝업을 허용해 주세요.",
  "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
  "auth/unauthorized-domain": "이 주소는 로그인이 허용되지 않았어요. Firebase 승인된 도메인을 확인해 주세요.",
};

/** 실패하면 사용자에게 보여줄 문장을 담은 Error를 던진다. */
export async function signInWithGoogle(): Promise<void> {
  try {
    if (USE_EMULATOR) {
      // 에뮬레이터 시험용: ?emuUser=이름 으로 계정을 고른다. 배포본에는 포함되지 않는다.
      const name = new URLSearchParams(location.search).get("emuUser") ?? "tester";
      const token = JSON.stringify({ sub: name, email: `${name}@example.com`, email_verified: true });
      await signInWithCredential(auth, GoogleAuthProvider.credential(token));
      return;
    }
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    throw new Error(SIGN_IN_ERRORS[code] ?? `로그인하지 못했어요. (${code || "알 수 없는 오류"})`);
  }
}

/** 올라가지 않은 변경이 있으면 로그아웃하지 않고 false를 돌려준다. 성공하면 이 기기의 사본을 지운다. */
export async function signOutAndClear(): Promise<boolean> {
  const flushed = await Promise.race([
    waitForPendingWrites(db).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), LOGOUT_WAIT_MS)),
  ]);
  if (!flushed) return false;
  await signOut(auth);
  await terminate(db);
  await clearIndexedDbPersistence(db).catch(() => undefined); // 다른 탭이 열려 있으면 실패할 수 있다.
  return true;
}

/** 이 기기 기록을 계정에 합치고 올린 건수를 돌려준다. 서버에 연결되어야 한다. */
export async function mergeIntoAccount(uid: string, settings: Settings, records: SubRecord[]): Promise<number> {
  const [cloudDocs, cloudSettings] = await Promise.all([
    getDocsFromServer(recordsCol(uid)),
    getDocFromServer(settingsDoc(uid)),
  ]);
  const cloud = cloudDocs.docs.flatMap((d) => recordFromDoc(d.id, d.data()) ?? []);
  const uploads = recordsToUpload(records, cloud);
  await inBatches(uploads, (batch, r) => batch.set(recordDoc(uid, r.id), recordData(r)));
  if (!cloudSettings.exists()) await setDoc(settingsDoc(uid), settings);
  return uploads.length;
}

async function inBatches<T>(items: T[], apply: (batch: WriteBatch, item: T) => void): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    items.slice(i, i + BATCH_LIMIT).forEach((item) => apply(batch, item));
    await batch.commit();
  }
}

interface Listeners {
  onRecords: (records: SubRecord[]) => void;
  onSettings: (settings: Partial<Settings> | null) => void;
  onStatus: (status: SyncStatus) => void;
  onError: (error: unknown) => void;
}

export function subscribe(uid: string, listeners: Listeners): () => void {
  const stopRecords = onSnapshot(
    recordsCol(uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      listeners.onRecords(snapshot.docs.flatMap((d) => recordFromDoc(d.id, d.data()) ?? []));
      const { hasPendingWrites, fromCache } = snapshot.metadata;
      listeners.onStatus(hasPendingWrites ? "pending" : fromCache ? "offline" : "synced");
    },
    listeners.onError,
  );
  const stopSettings = onSnapshot(
    settingsDoc(uid),
    (snapshot) => listeners.onSettings(snapshot.exists() ? (snapshot.data() as Partial<Settings>) : null),
    listeners.onError,
  );
  return () => {
    stopRecords();
    stopSettings();
  };
}

// 쓰기는 오프라인이면 대기열에 들어가므로 완료를 기다리지 않는다. 화면에는 onSnapshot으로 바로 반영된다.
export const putRecord = (uid: string, record: SubRecord) => setDoc(recordDoc(uid, record.id), recordData(record));

export const removeRecord = (uid: string, id: string) => deleteDoc(recordDoc(uid, id));

export const patchSettings = (uid: string, patch: Partial<Settings>) =>
  setDoc(settingsDoc(uid), patch, { merge: true });

/** 백업 불러오기: 계정의 기록을 파일 내용으로 바꾼다. */
export async function replaceRecords(uid: string, current: SubRecord[], next: SubRecord[]): Promise<void> {
  const keep = new Set(next.map((r) => r.id));
  await inBatches(
    current.filter((r) => !keep.has(r.id)),
    (batch, r) => batch.delete(recordDoc(uid, r.id)),
  );
  await inBatches(next, (batch, r) => batch.set(recordDoc(uid, r.id), recordData(r)));
}

export const replaceSettings = (uid: string, settings: Settings) => setDoc(settingsDoc(uid), settings);
