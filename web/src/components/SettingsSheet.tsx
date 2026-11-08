import { useRef, useState } from "react";
import { computeRecord, subFeeFor } from "../lib/calc";
import { parseAmount, shortBroker } from "../lib/format";
import { parseBackup, useStore, type Backup } from "../lib/store";
import { Sheet } from "./Sheet";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function NumberField(props: { label: string; value: number; suffix: string; step?: string; onChange: (n: number) => void }) {
  return (
    <label className="setting-row">
      <span>{props.label}</span>
      <span className="money-input small">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={props.step ?? "1"}
          value={props.value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0) props.onChange(n);
          }}
        />
        <span>{props.suffix}</span>
      </span>
    </label>
  );
}

export function SettingsSheet({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const { settings, updateSettings, records, ipoByNo, restore, data, reload, dataStatus } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);

  const exportBackup = () => {
    const backup: Backup = { version: 1, settings, records };
    download(`공모주_백업_${stamp()}.json`, JSON.stringify(backup, null, 1), "application/json");
  };

  const exportCsv = () => {
    const head = ["기업명", "상장일", "증권사", "배정수량", "공모가", "시초가", "판매가", "수익", "수익률(%)", "상태"];
    const label = { sold: "판매", holding: "보유중", unallocated: "미배정", pending: "상장 전" };
    const lines = records.map((r) => {
      const ipo = ipoByNo.get(r.ipoNo);
      const c = computeRecord(r, ipo, settings);
      return [
        ipo?.name ?? r.ipoNo, ipo?.listDate ?? "", r.broker, r.qty, ipo?.price ?? "", ipo?.open ?? "",
        c.sellPrice ?? "", c.profit ?? "", c.rate?.toFixed(2) ?? "", label[c.status],
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
    });
    download(`공모주_기록_${stamp()}.csv`, "﻿" + [head.join(","), ...lines].join("\r\n"), "text/csv");
  };

  const importBackup = async (file: File) => {
    try {
      setPendingBackup(parseBackup(await file.text()));
    } catch (e) {
      onToast(`불러오지 못했어요: ${e instanceof Error ? e.message : "파일 오류"}`);
    }
  };

  return (
    <Sheet title="설정" onClose={onClose}>
      <h3 className="section-title">수익 계산</h3>
      <NumberField label="증권거래세" suffix="%" step="0.01" value={settings.taxRate} onChange={(taxRate) => updateSettings({ taxRate })} />
      <NumberField label="매도 수수료" suffix="%" step="0.001" value={settings.sellFeeRate} onChange={(sellFeeRate) => updateSettings({ sellFeeRate })} />
      <NumberField label="기본 청약수수료" suffix="원" step="500" value={settings.defaultSubFee} onChange={(defaultSubFee) => updateSettings({ defaultSubFee })} />
      <NumberField label="기본 최소 청약수량" suffix="주" value={settings.defaultMinQty} onChange={(defaultMinQty) => updateSettings({ defaultMinQty })} />

      <h3 className="section-title">내 증권사별 조건</h3>
      {settings.myBrokers.length === 0 && <p className="hint">왼쪽 메뉴에서 증권사를 고르면 여기서 따로 정할 수 있어요.</p>}
      {settings.myBrokers.map((name) => (
        <div className="broker-setting" key={name}>
          <strong>{shortBroker(name)}</strong>
          {settings.feeFreeBrokers.includes(name) ? (
            <span className="hint">청약수수료 면제</span>
          ) : (
            <label className="money-input small">
              <input
                aria-label={`${shortBroker(name)} 청약수수료`}
                inputMode="numeric"
                value={subFeeFor(name, settings)}
                onChange={(e) =>
                  updateSettings({ brokerSubFee: { ...settings.brokerSubFee, [name]: parseAmount(e.target.value) ?? 0 } })
                }
              />
              <span>원</span>
            </label>
          )}
          <label className="money-input small">
            <input
              aria-label={`${shortBroker(name)} 최소 청약수량`}
              inputMode="numeric"
              value={settings.brokerMinQty[name] ?? settings.defaultMinQty}
              onChange={(e) =>
                updateSettings({ brokerMinQty: { ...settings.brokerMinQty, [name]: parseAmount(e.target.value) ?? 0 } })
              }
            />
            <span>주</span>
          </label>
        </div>
      ))}

      <h3 className="section-title">백업</h3>
      <p className="hint">기록은 이 기기에만 저장돼요. 기기를 바꾸거나 앱을 지우기 전에 백업 파일을 받아 두세요.</p>
      <div className="btn-row">
        <button className="btn" onClick={exportBackup}>백업 받기</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>백업 불러오기</button>
        <button className="btn" onClick={exportCsv}>엑셀용 CSV</button>
      </div>
      {pendingBackup && (
        <div className="confirm-box" role="alert">
          <p>
            지금 기록 {records.length}건을 지우고 파일의 {pendingBackup.records.length}건으로 바꿀까요? 되돌릴 수 없어요.
          </p>
          <div className="btn-pair">
            <button
              className="btn primary"
              onClick={() => {
                restore(pendingBackup);
                onToast(`기록 ${pendingBackup.records.length}건을 불러왔어요`);
                setPendingBackup(null);
              }}
            >
              바꾸기
            </button>
            <button className="btn" onClick={() => setPendingBackup(null)}>
              취소
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="backup-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importBackup(file);
          e.target.value = "";
        }}
      />

      <h3 className="section-title">공모주 정보</h3>
      <p className="hint">
        마지막 업데이트: {data ? data.updatedAt.replace("T", " ").slice(0, 16) : "없음"}
        <br />
        출처: 38커뮤니케이션, 네이버 증권. 시초가는 상장일 수집 시점 이후에 들어와요.
      </p>
      <button className="btn" disabled={dataStatus === "loading"} onClick={reload}>
        {dataStatus === "loading" ? "받는 중..." : "지금 다시 받기"}
      </button>
    </Sheet>
  );
}
