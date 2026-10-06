import { useEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ZONE_META, zoneOfBucket } from '../lib/pricing.js'

const MARGIN = { top: 30, right: 12, bottom: 4, left: 0 }
const Y_AXIS_WIDTH = 36
const CHART_HEIGHT = 260

/**
 * 竞品价格分布直方图：
 * 柱色按 低价区/合理区/高价区 三档着色，黑色虚线竖线精确标注推荐价位置
 * （按价格在 X 轴上的线性比例定位，随窗口宽度自适应）。
 */
export default function PriceDistributionChart({ distribution, low, high, recommended }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const buckets = distribution?.buckets ?? []
  const data = buckets.map((b) => ({ ...b, zone: zoneOfBucket(b, low, high) }))
  const priceCeiling = buckets.length > 0 ? buckets[buckets.length - 1].max : 100

  const plotLeft = Y_AXIS_WIDTH + MARGIN.left
  const plotWidth = width > 0 ? Math.max(0, width - plotLeft - MARGIN.right) : 0
  const clampedRec = Math.max(0, Math.min(Number(recommended) || 0, priceCeiling))
  const recX = plotLeft + (clampedRec / priceCeiling) * plotWidth

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {Object.values(ZONE_META).map((meta) => (
          <span key={meta.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: meta.color }} />
            {meta.label}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="inline-block h-3 border-l-2 border-dashed border-slate-900" />
          推荐价 ${Number(recommended).toFixed(2)}
        </span>
      </div>

      <div ref={containerRef} className="relative">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={data} margin={MARGIN}>
            <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
            <XAxis
              type="category"
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="number"
              allowDecimals={false}
              width={Y_AXIS_WIDTH}
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
              formatter={(value) => [`${value} 家竞品`, '数量']}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" barSize={44} radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.label} fill={ZONE_META[d.zone].color} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 推荐价竖线：价格按 X 轴线性比例定位 */}
        {plotWidth > 0 && (
          <>
            <div
              className="pointer-events-none absolute border-l-2 border-dashed border-slate-900"
              style={{ left: `${recX}px`, top: MARGIN.top, bottom: MARGIN.bottom }}
            />
            <div
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ left: `${recX}px`, top: 2 }}
            >
              推荐价 ${Number(recommended).toFixed(2)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
