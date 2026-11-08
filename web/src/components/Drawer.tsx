import { shortBroker } from "../lib/format";
import { useStore } from "../lib/store";
import { Sheet } from "./Sheet";

function BrokerGrid({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  return (
    <div className="broker-grid">
      {options.map((name) => (
        <label key={name} className="check">
          <input
            type="checkbox"
            checked={value.includes(name)}
            onChange={(e) => onChange(e.target.checked ? [...value, name] : value.filter((v) => v !== name))}
          />
          <span>{shortBroker(name)}</span>
        </label>
      ))}
    </div>
  );
}

export function Drawer({ onClose }: { onClose: () => void }) {
  const { brokers, settings, updateSettings } = useStore();
  return (
    <Sheet title="내 증권사" variant="drawer" onClose={onClose}>
      <h3 className="section-title">증권사</h3>
      <p className="hint">계좌가 있는 증권사를 고르세요.</p>
      <BrokerGrid value={settings.myBrokers} options={brokers} onChange={(myBrokers) => updateSettings({ myBrokers })} />
      <h3 className="section-title">수수료 면제</h3>
      <p className="hint">청약수수료를 내지 않는 증권사를 고르세요.</p>
      <BrokerGrid
        value={settings.feeFreeBrokers}
        options={brokers}
        onChange={(feeFreeBrokers) => updateSettings({ feeFreeBrokers })}
      />
    </Sheet>
  );
}
