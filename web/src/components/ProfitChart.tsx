import { useLayoutEffect, useRef, useState } from "react";
import { signedWon, won } from "../lib/format";
import type { MonthStat } from "../lib/stats";

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 44 };
const MIN_SLOT = 24; // 휴대폰 폭에서 12개월이 한 화면에 들어가는 간격

/** 눈금에 쓰기 좋은 간격을 고른다. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function axisLabel(n: number): string {
  if (n === 0) return "0";
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return abs >= 10000 ? `${sign}${+(abs / 10000).toFixed(1)}만` : `${sign}${abs.toLocaleString("ko-KR")}`;
}

/** 위쪽 또는 아래쪽 끝만 둥근 막대 경로 */
function barPath(x: number, y0: number, y1: number, width: number, roundTop: boolean): string {
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, width / 2, h);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return roundTop
    ? `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${bottom}Z`
    : `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + width - r}Q${x + width},${bottom} ${x + width},${bottom - r}V${top}Z`;
}

/**
 * 월별 수익 그래프.
 * 수익 막대는 0에서 위로, 손실 막대는 수익 막대 꼭대기에서 아래로 내려온다.
 * 손실 막대가 끝나는 지점이 그 달의 차익이다.
 */
export function ProfitChart({ months }: { months: MonthStat[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(340);
  const lastActive = [...months].reverse().find((m) => m.gain || m.loss);
  const [selected, setSelected] = useState(lastActive?.month ?? months[months.length - 1]?.month);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(el);
    // 기간이 길어 가로로 넘치면 가장 최근 달이 보이도록 오른쪽 끝에서 시작한다.
    el.scrollLeft = el.scrollWidth;
    return () => observer.disconnect();
  }, []);

  const multiYear = new Set(months.map((m) => m.month.slice(0, 4))).size > 1;
  const width = Math.max(boxWidth, PAD.left + PAD.right + months.length * MIN_SLOT);
  const plotWidth = width - PAD.left - PAD.right;
  const slot = plotWidth / Math.max(months.length, 1);
  const barWidth = Math.min(16, Math.max(8, (slot - 8) / 2));

  const maxValue = Math.max(0, ...months.map((m) => m.gain));
  const minValue = Math.min(0, ...months.map((m) => m.net));
  const step = niceStep(Math.max(maxValue - minValue, 1), 4);
  const top = Math.ceil(maxValue / step) * step || step;
  const bottom = Math.floor(minValue / step) * step;
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);

  const current = months.find((m) => m.month === selected);

  return (
    <figure className="chart">
      <div className="chart-legend">
        <span><i className="swatch gain" />수익</span>
        <span><i className="swatch loss" />손실</span>
        <span><i className="swatch net" />차익</span>
      </div>
      <div className="chart-scroll" ref={box}>
        <svg width={width} height={HEIGHT} role="img" aria-label="월별 수익과 손실 막대그래프">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "axis-zero" : "grid"} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{axisLabel(t)}</text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const isSelected = m.month === selected;
            const hasBars = m.gain > 0 || m.loss > 0;
            return (
              <g key={m.month}>
                {isSelected && <rect className="col-selected" x={cx - slot / 2 + 1} y={PAD.top} width={slot - 2} height={HEIGHT - PAD.top - PAD.bottom} rx={4} />}
                {m.gain > 0 && <path className="bar-gain" d={barPath(cx - barWidth - 1, y(0), y(m.gain), barWidth, true)} />}
                {m.loss > 0 && <path className="bar-loss" d={barPath(cx + 1, y(m.gain), y(m.net), barWidth, false)} />}
                {hasBars && <line className="net-mark" x1={cx - barWidth - 3} x2={cx + barWidth + 3} y1={y(m.net)} y2={y(m.net)} />}
                <text className={isSelected ? "tick on" : "tick"} x={cx} y={HEIGHT - 8} textAnchor="middle">
                  {multiYear ? `${m.month.slice(2, 4)}.${m.month.slice(5)}` : `${Number(m.month.slice(5))}월`}
                </text>
                <rect
                  className="hit"
                  x={cx - slot / 2}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  tabIndex={0}
                  role="button"
                  aria-label={`${m.month} 수익 ${won(m.gain)}, 손실 ${won(m.loss)}, 차익 ${signedWon(m.net)}`}
                  onClick={() => setSelected(m.month)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(m.month);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      {current && (
        <figcaption className="chart-detail">
          <strong>{Number(current.month.slice(0, 4))}년 {Number(current.month.slice(5))}월</strong>
          <dl>
            <div><dt>수익</dt><dd className="num">{won(current.gain)}</dd></div>
            <div><dt>손실</dt><dd className="num">{won(current.loss)}</dd></div>
            <div><dt>차익</dt><dd className="num strong">{signedWon(current.net)}</dd></div>
          </dl>
        </figcaption>
      )}
    </figure>
  );
}
