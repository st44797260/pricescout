/**
 * 双滑块价格区间。value: [lo, hi]，onChange([lo, hi])。
 * 双层原生 range 叠加，轨道由下方色条渲染。
 */
export default function RangeSlider({ min, max, step = 1, value, onChange }) {
  const [lo, hi] = value
  const span = Math.max(max - min, 1)
  const loPct = ((lo - min) / span) * 100
  const hiPct = ((hi - min) / span) * 100

  return (
    <div>
      <div className="dual-range">
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - step), hi])}
          style={{ zIndex: lo > (min + max) / 2 ? 3 : 1 }}
          aria-label="最低价格"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + step)])}
          aria-label="最高价格"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-muted">
        <span>${lo}</span>
        <span>${hi}</span>
      </div>
    </div>
  )
}

/** 单滑块（最低评分），带渐变填充轨道 */
export function SingleSlider({ min, max, step = 1, value, onChange, formatValue }) {
  const pct = ((value - min) / Math.max(max - min, 1)) * 100
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{
          background: `linear-gradient(to right, #2563EB ${pct}%, #E2E8F0 ${pct}%)`,
        }}
        aria-label="最低评分"
      />
      <div className="mt-1 flex justify-between text-xs tabular-nums text-ink-muted">
        <span>{formatValue ? formatValue(value) : value}</span>
        <span>{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}
