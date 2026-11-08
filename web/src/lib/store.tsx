import { del, get, set } from "idb-keyval";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type Ipo, type IpoData, type Settings, type SubRecord } from "../types";
import { firebaseConfig } from "./firebaseConfig";
import { brokerKey, COMMON_BROKERS } from "./format";

const STATE_KEY = "state-v1";
const DATA_KEY = "ipos-v1";
/** 저장된 로그인을 확인하는 동안 기다리는 최대 시간. 넘으면 이 기기 기록으로 먼저 연다. */
const AUTH_WAIT_MS = 4000;

export interface Backup {
  version: 1;
  settings?: Settings;
  records: SubRecord[];
}

type DataStatus = "loading" | "fresh" | "cached" | "failed";

export type CloudState = "off" | "merging" | "synced" | "pending" | "offline" | "error";

export interface Account {
  uid: string;
  email: string | null;
}

type CloudModule = typeof import("./cloud");

interface Store {
  ready: boolean;
  saveFailed: boolean;
  dataStatus: DataStatus;
  data: IpoData | null;
  ipoByNo: Map<number, Ipo>;
  brokers: string[];
  settings: Settings;
  records: SubRecord[];
  cloudAvailable: boolean;
  account: Account | null;
  cloudState: CloudState;
  cloudNotice: string | null;
  clearCloudNotice: () => void;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<string | null>;
  updateSettings: (patch: Partial<Settings>) => void;
  addRecord: (ipoNo: number, broker: string) => void;
  updateRecord: (id: string, patch: Partial<SubRecord>) => void;
  removeRecord: (id: string) => void;
  restore: (backup: Backup) => void;
  reload: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("StoreProvider가 필요합니다");
  return store;
}

function normalizeData(data: IpoData): IpoData {
  return {
    ...data,
    ipos: data.ipos.map((ipo) => ({
      ...ipo,
      underwriters: ipo.underwriters?.map((u) => ({ ...u, name: brokerKey(u.name) })),
    })),
  };
}

/** 가져온 백업 파일이 앱에서 쓸 수 있는 형식인지 확인한다. */
export function parseBackup(text: string): Backup {
  const raw = JSON.parse(text);
  if (!raw || !Array.isArray(raw.records)) throw new Error("기록이 없는 파일이에요");
  const records: SubRecord[] = raw.records.map((r: SubRecord) => {
    if (typeof r.ipoNo !== "number" || typeof r.broker !== "string" || typeof r.qty !== "number") {
      throw new Error("형식이 맞지 않는 기록이 있어요");
    }
    const sell = r.sellPrice;
    return {
      id: String(r.id ?? crypto.randomUUID()),
      ipoNo: r.ipoNo,
      broker: r.broker,
      qty: r.qty,
      sellPrice: typeof sell === "number" ? sell : null,
    };
  });
  return { version: 1, records, settings: raw.settings ? { ...DEFAULT_SETTINGS, ...raw.settings } : undefined };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [records, setRecords] = useState<SubRecord[]>([]);
  const [data, setData] = useState<IpoData | null>(null);
  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [cloudState, setCloudState] = useState<CloudState>("off");
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);

  // 비동기 콜백에서 최신 값을 읽기 위한 참조
  const latest = useRef({ settings, records });
  latest.current = { settings, records };
  const localLoaded = useRef(false);
  /** 이 기기에 아직 계정으로 옮기지 않은 저장본이 있는지 */
  const hasLocalState = useRef(false);
  /** 값이 있으면 계정 모드. 이때는 이 기기 저장소에 쓰지 않는다. */
  const cloudUid = useRef<string | null>(null);
  const cloudModule = useRef<CloudModule | null>(null);
  /** 로그아웃 중에는 연결을 닫으며 생기는 오류를 알리지 않는다. */
  const signingOut = useRef(false);

  const fetchData = useCallback(async () => {
    setDataStatus("loading");
    const cached = await get<IpoData>(DATA_KEY).catch(() => undefined);
    if (cached) setData(cached);
    try {
      const res = await fetch("data/ipos.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const fresh = normalizeData((await res.json()) as IpoData);
      setData(fresh);
      setDataStatus("fresh");
      await set(DATA_KEY, fresh).catch(() => undefined);
    } catch {
      setDataStatus(cached ? "cached" : "failed");
    }
  }, []);

  const onCloudError = useCallback((error: unknown) => {
    if (signingOut.current) return;
    console.error("계정 연동 오류", error);
    setCloudState("error");
  }, []);

  /** 쓰기 실패는 화면 상태로 알린다. 오프라인이면 실패하지 않고 대기한다. */
  const cloudWrite = useCallback(
    (write: (cloud: CloudModule, uid: string) => Promise<unknown>): boolean => {
      const uid = cloudUid.current;
      const cloud = cloudModule.current;
      if (!uid || !cloud) return false;
      write(cloud, uid).catch(onCloudError);
      return true;
    },
    [onCloudError],
  );

  useEffect(() => {
    let cancelled = false;
    let stopAuth = () => {};
    let stopData = () => {};

    const startAccount = async (cloud: CloudModule, uid: string) => {
      setCloudState("merging");
      if (hasLocalState.current) {
        const local = latest.current;
        try {
          const uploaded = await cloud.mergeIntoAccount(uid, local.settings, local.records);
          await del(STATE_KEY);
          hasLocalState.current = false;
          if (uploaded > 0) setCloudNotice(`이 기기 기록 ${uploaded}건을 계정에 합쳤어요.`);
        } catch (error) {
          // 합치지 못하면 이 기기 기록을 그대로 두고, 다음에 열 때 다시 시도한다.
          onCloudError(error);
          setCloudNotice("이 기기 기록을 계정에 합치지 못했어요. 인터넷 연결을 확인한 뒤 앱을 다시 열어 주세요.");
          return;
        }
      }
      if (cancelled) return;
      cloudUid.current = uid;
      stopData = cloud.subscribe(uid, {
        onRecords: setRecords,
        onSettings: (remote) => setSettings({ ...DEFAULT_SETTINGS, ...remote }),
        onStatus: setCloudState,
        onError: onCloudError,
      });
    };

    (async () => {
      try {
        const saved = await get<{ settings: Settings; records: SubRecord[] }>(STATE_KEY);
        if (saved) {
          hasLocalState.current = true;
          setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
          setRecords(saved.records ?? []);
        }
      } catch {
        setSaveFailed(true);
      }
      localLoaded.current = true;
      // 브라우저가 저장 공간을 임의로 지우지 않도록 요청한다. 거절되어도 앱은 동작한다.
      navigator.storage?.persist?.().catch(() => undefined);

      if (!firebaseConfig) {
        setReady(true);
        return;
      }
      const showAnyway = setTimeout(() => setReady(true), AUTH_WAIT_MS);
      try {
        const cloud = await import("./cloud");
        if (cancelled) return;
        cloudModule.current = cloud;
        stopAuth = cloud.watchAuth((user) => {
          clearTimeout(showAnyway);
          setReady(true);
          if (!user) {
            setAccount(null);
            setCloudState("off");
            return;
          }
          setAccount({ uid: user.uid, email: user.email });
          void startAccount(cloud, user.uid);
        });
      } catch (error) {
        // 연동 코드를 불러오지 못해도 이 기기 기록으로 계속 쓸 수 있다.
        console.error("계정 연동을 불러오지 못했어요", error);
        clearTimeout(showAnyway);
        setReady(true);
      }
    })();
    void fetchData();

    return () => {
      cancelled = true;
      stopAuth();
      stopData();
    };
  }, [fetchData, onCloudError]);

  // 계정 연동이 시작되기 전에는 이 기기에 저장한다. 계정에 합치지 못한 동안의 입력도 여기에 남는다.
  useEffect(() => {
    if (!localLoaded.current || cloudUid.current) return;
    hasLocalState.current = true;
    set(STATE_KEY, { settings, records }).then(
      () => setSaveFailed(false),
      () => setSaveFailed(true),
    );
  }, [settings, records]);

  const ipoByNo = useMemo(() => new Map((data?.ipos ?? []).map((i) => [i.no, i])), [data]);

  const brokers = useMemo(() => {
    const seen = new Set(COMMON_BROKERS);
    for (const ipo of data?.ipos ?? []) for (const u of ipo.underwriters ?? []) seen.add(u.name);
    return [...seen];
  }, [data]);

  const store = useMemo<Store>(
    () => ({
      ready,
      saveFailed,
      dataStatus,
      data,
      ipoByNo,
      brokers,
      settings,
      records,
      cloudAvailable: !!firebaseConfig,
      account,
      cloudState,
      cloudNotice,
      clearCloudNotice: () => setCloudNotice(null),
      signIn: async () => {
        try {
          const cloud = cloudModule.current ?? (await import("./cloud"));
          cloudModule.current = cloud;
          await cloud.signInWithGoogle();
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : "로그인하지 못했어요.";
        }
      },
      signOut: async () => {
        const cloud = cloudModule.current;
        if (!cloud) return null;
        signingOut.current = true;
        const done = await cloud.signOutAndClear();
        signingOut.current = false;
        if (!done) return "아직 올라가지 않은 변경이 있어요. 인터넷에 연결한 뒤 다시 시도해 주세요.";
        location.reload();
        return null;
      },
      updateSettings: (patch) => {
        setSettings((s) => ({ ...s, ...patch }));
        cloudWrite((cloud, uid) => cloud.patchSettings(uid, patch));
      },
      addRecord: (ipoNo, broker) => {
        const record: SubRecord = { id: crypto.randomUUID(), ipoNo, broker, qty: 0, sellPrice: null };
        setRecords((list) => [...list, record]);
        cloudWrite((cloud, uid) => cloud.putRecord(uid, record));
      },
      updateRecord: (id, patch) => {
        const current = records.find((r) => r.id === id);
        if (!current) return;
        const record = { ...current, ...patch };
        setRecords((list) => list.map((r) => (r.id === id ? record : r)));
        cloudWrite((cloud, uid) => cloud.putRecord(uid, record));
      },
      removeRecord: (id) => {
        setRecords((list) => list.filter((r) => r.id !== id));
        cloudWrite((cloud, uid) => cloud.removeRecord(uid, id));
      },
      restore: (backup) => {
        const current = records;
        setRecords(backup.records);
        if (backup.settings) setSettings(backup.settings);
        cloudWrite(async (cloud, uid) => {
          await cloud.replaceRecords(uid, current, backup.records);
          if (backup.settings) await cloud.replaceSettings(uid, backup.settings);
        });
      },
      reload: () => void fetchData(),
    }),
    [ready, saveFailed, dataStatus, data, ipoByNo, brokers, settings, records, account, cloudState, cloudNotice, fetchData, cloudWrite],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
