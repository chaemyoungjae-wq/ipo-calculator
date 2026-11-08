import { useEffect, useState } from "react";
import { Drawer } from "./components/Drawer";
import { CloseIcon, GearIcon, MenuIcon } from "./components/icons";
import { IpoDetail } from "./components/IpoDetail";
import { RecordCard } from "./components/RecordCard";
import { SettingsSheet } from "./components/SettingsSheet";
import { useStore } from "./lib/store";
import { ProfitPage } from "./pages/ProfitPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { UpcomingPage } from "./pages/UpcomingPage";

type Tab = "upcoming" | "subscriptions" | "profit";

const TABS: { id: Tab; label: string }[] = [
  { id: "upcoming", label: "청약 정보" },
  { id: "subscriptions", label: "내 청약" },
  { id: "profit", label: "수익" },
];

export function App() {
  const { ready, saveFailed, dataStatus, data, reload, cloudState, cloudNotice, clearCloudNotice } = useStore();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ipoNo, setIpoNo] = useState<number | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" aria-label="증권사 선택 열기" onClick={() => setDrawerOpen(true)}>
          <MenuIcon />
        </button>
        <h1>공모주 계산기</h1>
        <button className="icon-btn" aria-label="설정 열기" onClick={() => setSettingsOpen(true)}>
          <GearIcon />
        </button>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {cloudNotice && (
        <p className="notice">
          {cloudNotice}{" "}
          <button className="link" onClick={clearCloudNotice}>
            닫기
          </button>
        </p>
      )}
      {cloudState === "error" && !cloudNotice && (
        <p className="notice danger">계정 연동에 문제가 생겼어요. 앱을 다시 열어 주세요.</p>
      )}
      {saveFailed && <p className="notice danger">기록을 저장하지 못했어요. 설정에서 백업 파일을 내려받아 두세요.</p>}
      {dataStatus === "cached" && (
        <p className="notice">
          최신 정보를 받지 못해 마지막으로 받은 정보를 보여드려요.{" "}
          <button className="link" onClick={reload}>
            다시 시도
          </button>
        </p>
      )}
      {dataStatus === "failed" && !data && (
        <p className="notice danger">
          공모주 정보를 받지 못했어요. 인터넷 연결을 확인해 주세요.{" "}
          <button className="link" onClick={reload}>
            다시 시도
          </button>
        </p>
      )}

      <main>
        {!ready ? null : tab === "upcoming" ? (
          <UpcomingPage onOpen={setIpoNo} />
        ) : tab === "subscriptions" ? (
          <SubscriptionsPage onOpen={setRecordId} />
        ) : (
          <ProfitPage onOpen={setRecordId} />
        )}
      </main>

      {drawerOpen && <Drawer onClose={() => setDrawerOpen(false)} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onToast={setToast} />}
      {ipoNo !== null && <IpoDetail ipoNo={ipoNo} onClose={() => setIpoNo(null)} onToast={setToast} />}
      {recordId !== null && <RecordCard recordId={recordId} onClose={() => setRecordId(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="알림 닫기" className="toast-close" onClick={() => setToast(null)}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
