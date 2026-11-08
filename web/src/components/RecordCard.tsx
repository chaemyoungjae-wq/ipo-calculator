import { useState } from "react";
import { computeRecord } from "../lib/calc";
import { parseAmount, shortBroker, signedPct, signedWon, toneOf, won } from "../lib/format";
import { useStore } from "../lib/store";
import { Sheet } from "./Sheet";

export function RecordCard({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const { records, ipoByNo, settings, updateRecord, removeRecord } = useStore();
  const record = records.find((r) => r.id === recordId);
  const ipo = record && ipoByNo.get(record.ipoNo);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sellText, setSellText] = useState(() => {
    const value = record?.sellPrice ?? ipo?.open;
    return value != null ? value.toLocaleString("ko-KR") : "";
  });
  if (!record) return null;

  const result = computeRecord(record, ipo, settings);
  const options = new Set((ipo?.underwriters ?? []).map((u) => u.name));
  options.add(record.broker);

  const onSellChange = (text: string) => {
    const amount = parseAmount(text);
    setSellText(amount === null ? "" : amount.toLocaleString("ko-KR"));
    updateRecord(record.id, { sellPrice: amount });
  };

  const useOpen = () => {
    setSellText(ipo?.open != null ? ipo.open.toLocaleString("ko-KR") : "");
    updateRecord(record.id, { sellPrice: null });
  };

  const rateText =
    result.status === "sold" && result.rate !== null
      ? signedPct(result.rate)
      : result.status === "holding"
        ? "보유중"
        : result.status === "unallocated"
          ? "미배정"
          : "";

  return (
    <Sheet
      title={ipo?.name ?? "정보 없는 종목"}
      aside={<span className={`head-rate num ${toneOf(result.rate)}`}>{rateText}</span>}
      onClose={onClose}
    >
      <div className="field">
        <span className="field-label">증권사</span>
        <div className="radio-group" role="radiogroup" aria-label="증권사">
          {[...options].map((name) => (
            <label key={name} className={name === record.broker ? "radio on" : "radio"}>
              <input
                type="radio"
                name="broker"
                checked={name === record.broker}
                onChange={() => updateRecord(record.id, { broker: name })}
              />
              {shortBroker(name)}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="qty">
          배정 수량
        </label>
        <div className="stepper">
          <button aria-label="수량 줄이기" onClick={() => updateRecord(record.id, { qty: Math.max(0, record.qty - 1) })}>
            −
          </button>
          <input
            id="qty"
            inputMode="numeric"
            value={record.qty}
            onChange={(e) => updateRecord(record.id, { qty: parseAmount(e.target.value) ?? 0 })}
          />
          <button aria-label="수량 늘리기" onClick={() => updateRecord(record.id, { qty: record.qty + 1 })}>
            +
          </button>
        </div>
      </div>

      <dl className="info">
        <div className="info-row">
          <dt>공모가</dt>
          <dd>{ipo?.price ? won(ipo.price) : "미정"}</dd>
        </div>
        <div className="info-row">
          <dt>시초가</dt>
          <dd>{ipo?.open ? won(ipo.open) : "상장 후 자동 입력"}</dd>
        </div>
      </dl>
      {ipo?.priceCheck && <p className="notice inline">출처마다 시초가가 달라요. 실제 체결가를 확인해 주세요.</p>}

      <div className="field">
        <label className="field-label" htmlFor="sell">
          판매가
        </label>
        <div className="money-input">
          <input
            id="sell"
            inputMode="numeric"
            value={sellText}
            placeholder={ipo?.open ? "시초가" : "상장 후 입력"}
            onChange={(e) => onSellChange(e.target.value)}
          />
          <span>원</span>
        </div>
      </div>
      <p className="hint right">
        아직 안 팔았다면 0원을 입력하세요.
        {ipo?.open != null && record.sellPrice !== null && (
          <>
            {" "}
            <button className="link" onClick={useOpen}>
              시초가로 되돌리기
            </button>
          </>
        )}
      </p>

      <div className="profit-box">
        <span>수익</span>
        <strong className={`num ${toneOf(result.profit)}`}>{result.profit !== null ? signedWon(result.profit) : "-"}</strong>
      </div>
      {result.status === "sold" && (
        <p className="hint right">
          청약수수료 {won(result.subFee)}, 세금·매도 수수료 {won(result.sellCost)} 포함
        </p>
      )}

      {confirmingDelete ? (
        <div className="confirm-box" role="alert">
          <p>{ipo?.name ?? "이 종목"} 기록을 삭제할까요? 되돌릴 수 없어요.</p>
          <div className="btn-pair">
            <button
              className="btn danger-text"
              onClick={() => {
                removeRecord(record.id);
                onClose();
              }}
            >
              삭제
            </button>
            {/* 처음 누른 삭제 버튼 자리에 취소를 두어 두 번 눌러도 지워지지 않게 한다. */}
            <button className="btn" onClick={() => setConfirmingDelete(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-pair">
          <button className="btn primary" onClick={onClose}>
            확인
          </button>
          <button className="btn danger-text" onClick={() => setConfirmingDelete(true)}>
            삭제
          </button>
        </div>
      )}
    </Sheet>
  );
}
