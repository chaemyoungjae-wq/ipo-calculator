import { get, set } from "idb-keyval";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type Ipo, type IpoData, type Settings, type SubRecord } from "../types";
import { brokerKey, COMMON_BROKERS } from "./format";

const STATE_KEY = "state-v1";
const DATA_KEY = "ipos-v1";

export interface Backup {
  version: 1;
  settings?: Settings;
  records: SubRecord[];
}

type DataStatus = "loading" | "fresh" | "cached" | "failed";

interface Store {
  ready: boolean;
  saveFailed: boolean;
  dataStatus: DataStatus;
  data: IpoData | null;
  ipoByNo: Map<number, Ipo>;
  brokers: string[];
  settings: Settings;
  records: SubRecord[];
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
  const loaded = useRef(false);

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

  useEffect(() => {
    (async () => {
      try {
        const saved = await get<{ settings: Settings; records: SubRecord[] }>(STATE_KEY);
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
          setRecords(saved.records ?? []);
        }
      } catch {
        setSaveFailed(true);
      }
      loaded.current = true;
      setReady(true);
      // 브라우저가 저장 공간을 임의로 지우지 않도록 요청한다. 거절되어도 앱은 동작한다.
      navigator.storage?.persist?.().catch(() => undefined);
    })();
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!loaded.current) return;
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
      updateSettings: (patch) => setSettings((s) => ({ ...s, ...patch })),
      addRecord: (ipoNo, broker) =>
        setRecords((list) => [...list, { id: crypto.randomUUID(), ipoNo, broker, qty: 0, sellPrice: null }]),
      updateRecord: (id, patch) => setRecords((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r))),
      removeRecord: (id) => setRecords((list) => list.filter((r) => r.id !== id)),
      restore: (backup) => {
        setRecords(backup.records);
        if (backup.settings) setSettings(backup.settings);
      },
      reload: () => void fetchData(),
    }),
    [ready, saveFailed, dataStatus, data, ipoByNo, brokers, settings, records, fetchData],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
