import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

interface Props {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  prevLabel: string;
  nextLabel: string;
}

/** 테두리 하나 안에 왼쪽·오른쪽 넘김 영역과 가운데 선택 칸이 있는 상자. */
export function StepSelect(props: Props) {
  return (
    <div className="step-select">
      <button className="step-arrow" aria-label={props.prevLabel} disabled={props.prevDisabled} onClick={props.onPrev}>
        <ChevronLeftIcon size={18} />
      </button>
      <select aria-label={props.label} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button className="step-arrow" aria-label={props.nextLabel} disabled={props.nextDisabled} onClick={props.onNext}>
        <ChevronRightIcon size={18} />
      </button>
    </div>
  );
}
