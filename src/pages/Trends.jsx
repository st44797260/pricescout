import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import MultiSelect from '../components/MultiSelect.jsx'
import AnomalyList from '../components/AnomalyList.jsx'
import {
  detectAnomalies,
  getSnapshotSeries,
  ignoreAnomaly,
  listAnomalies,
  markAnomalyRead,
} from '../lib/api.js'
import {
  buildCompetitorSeries,
  mergeSeries,
  productPriceChanges,
  weeklyNewProducts,
} from '../lib/trends.js'
import { cn, formatPrice } from '../lib/format.js'

const LINE_COLORS = ['#2563EB', '#F97316', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6']

const RANGE_OPTIONS = [
  { value: 7, label: '近7天' },
  { value: 30, label: '近30天' },
  { value: 90, label: '近90天' },
]

const DIMENSION_OPTIONS = [
  { value: 'price', label: '价格' },
  { value: 'rating', label: '评分' },
  { value: 'review_count', label: '评价数' },
  { value: 'new_products', label: '新品数量' },
]

export default function Trends() {
  const [rows, setRows] = useState(null) // 快照序列
  const [anomalies, setAnomalies] = useState([])
  const [error, setError] = useState('')
  const [competitorIds, setCompetitorIds] = useState([])
  const [days, setDays] = useState(30)
  const [dimension, setDimension] = useState('price')
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState(null) // { ok, text }

  const load = useCallback(async () => {
    try {
      const [series, anomalyRows] = await Promise.all([
        getSnapshotSeries(days),
        listAnomalies(),
      ])
      setRows(series)
      setAnomalies(anomalyRows)
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载趋势数据失败')
      setRows([])
    }
  }, [days])

  useEffect(() => {
    load()
  }, [load])

  const competitorOptions = useMemo(() => {
    if (!rows) return []
    const seen = new Map()
    for (const r of rows) {
      if (!seen.has(r.competitor_id)) seen.set(r.competitor_id, r.competitor_name)
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [rows])

  const filteredRows = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => competitorIds.length === 0 || competitorIds.includes(r.competitor_id),
      ),
    [rows, competitorIds],
  )

  const { merged, lineDefs } = useMemo(() => {
    const series = buildCompetitorSeries(filteredRows, dimension)
    return {
      merged: mergeSeries(series),
      lineDefs: series.competitors.map((c, i) => ({
        key: c.name,
        color: LINE_COLORS[i % LINE_COLORS.length],
      })),
    }
  }, [filteredRows, dimension])

  // 异常红点（主图维度为价格时）：把降价促销事件映射到该竞品当日均价
  const anomalyDots = useMemo(() => {
    if (dimension !== 'price') return []
    const dots = []
    for (const a of anomalies) {
      if (a.type !== 'price_drop') continue
      if (competitorIds.length > 0 && !competitorIds.includes(a.competitor_id)) continue
      const date = String(a.detected_at).slice(0, 10)
      const row = merged.find((m) => m.date === date)
      const value = row?.[a.competitor_name]
      if (value != null) {
        dots.push({ date, name: a.competitor_name, value })
      }
    }
    return dots
  }, [anomalies, merged, dimension, competitorIds])

  const topChanges = useMemo(
    () => productPriceChanges(filteredRows).slice(0, 5),
    [filteredRows],
  )
  const weeklyNew = useMemo(() => weeklyNewProducts(filteredRows), [filteredRows])
  const ratingSeries = useMemo(() => {
    const series = buildCompetitorSeries(filteredRows, 'rating')
    return mergeSeries(series)
  }, [filteredRows])

  const handleDetect = async () => {
    if (detecting) return
    setDetecting(true)
    setDetectMsg(null)
    try {
      const { detected } = await detectAnomalies()
      setAnomalies(await listAnomalies())
      setDetectMsg({
        ok: true,
        text: detected > 0 ? `检测完成，新发现 ${detected} 条异常` : '检测完成，未发现新异常',
      })
    } catch (err) {
      setDetectMsg({ ok: false, text: err?.message ?? '检测失败' })
    } finally {
      setDetecting(false)
      setTimeout(() => setDetectMsg(null), 5000)
    }
  }

  const handleMarkRead = async (a) => {
    await markAnomalyRead(a.id)
    setAnomalies((prev) => prev.map((x) => (x.id === a.id ? { ...x, is_read: true } : x)))
  }

  const handleIgnore = async (a) => {
    await ignoreAnomaly(a.id)
    setAnomalies((prev) => prev.filter((x) => x.id !== a.id))
  }

  const dimensionLabel = DIMENSION_OPTIONS.find((d) => d.value === dimension)?.label
  const formatValue = (v) => {
    if (v == null) return '—'
    if (dimension === 'price') return formatPrice(v)
    if (dimension === 'review_count') return Number(v).toLocaleString('en-US')
    if (dimension === 'rating') return Number(v).toFixed(2)
    return String(Math.round(v))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="趋势监控"
          description="跟踪竞品价格、评分与新品节奏，自动发现异常波动。"
        />
        <div className="mb-6 flex items-center gap-3">
          {detectMsg && (
            <span
              className={cn(
                'text-sm',
                detectMsg.ok ? 'text-emerald-600' : 'text-red-600',
              )}
            >
              {detectMsg.text}
            </span>
          )}
          <button type="button" className="btn btn-outline" onClick={handleDetect} disabled={detecting}>
            <RefreshCw className={cn('h-4 w-4', detecting && 'animate-spin')} />
            {detecting ? '检测中…' : '运行异常检测'}
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="card flex flex-wrap items-end gap-x-5 gap-y-3 p-4">
        <div className="w-52">
          <label className="mb-1 block text-xs font-medium text-ink-muted">选择竞品</label>
          <MultiSelect
            options={competitorOptions}
            value={competitorIds}
            onChange={setCompetitorIds}
            allLabel="全部竞品"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-ink-muted">时间范围</label>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-ink-muted">监控维度</label>
          <select
            className="input"
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
          >
            {DIMENSION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-xs text-slate-400">
          {dimension === 'price'
            ? '红点标注价格较前次快照下降超过 10% 的异常'
            : `当前维度：${dimensionLabel}`}
        </p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 主图表 */}
      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            竞品{dimensionLabel}趋势
          </h3>
          <span className="text-xs text-ink-muted">拖动下方滑块可缩放时间轴</span>
        </div>
        {rows === null ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : merged.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            暂无快照数据，先到竞品管理完成一次采集。
          </p>
        ) : dimension === 'new_products' ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={merged} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value, name) => [`${value} 个新品`, name]}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
              />
              {lineDefs.map((def) => (
                <Bar key={def.key} dataKey={def.key} fill={def.color} fillOpacity={0.8} radius={[3, 3, 0, 0]} />
              ))}
              <Brush data={merged} dataKey="date" height={26} travellerWidth={8} stroke="#CBD5E1" fill="#F8FAFC" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={merged} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={dimension === 'rating' ? [3, 5] : ['auto', 'auto']}
                tickFormatter={(v) => (dimension === 'price' ? `$${v}` : v)}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                width={dimension === 'price' ? 48 : 36}
              />
              <Tooltip
                formatter={(value, name) => [formatValue(value), name]}
                labelFormatter={(label) => format(new Date(`${label}T00:00:00`), 'yyyy-MM-dd')}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
              />
              {lineDefs.map((def) => (
                <Line
                  key={def.key}
                  type="monotone"
                  dataKey={def.key}
                  stroke={def.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
              {/* 异常波动红点 */}
              {anomalyDots.map((dot) => (
                <ReferenceDot
                  key={`${dot.date}-${dot.name}`}
                  x={dot.date}
                  y={dot.value}
                  r={5}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              ))}
              <Brush data={merged} dataKey="date" height={26} travellerWidth={8} stroke="#CBD5E1" fill="#F8FAFC" />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {lineDefs.map((def) => (
            <span key={def.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full" style={{ background: def.color }} />
              {def.key}
            </span>
          ))}
          {dimension === 'price' && anomalyDots.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              异常波动（降价 &gt; 10%）
            </span>
          )}
        </div>
      </div>

      {/* 三个小卡片 */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 价格变化排行 */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">价格变化排行</h3>
            <p className="mt-0.5 text-xs text-ink-muted">最近两次快照涨跌幅最大的 5 个产品</p>
          </div>
          {topChanges.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-ink-muted">数据不足，暂无价格变化</p>
          ) : (
            <div>
              {topChanges.map((c) => (
                <div
                  key={c.product_id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink" title={c.product_title}>
                      {c.product_title}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {c.competitor_name} · {formatPrice(c.old)} → {formatPrice(c.recent)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      c.changePct < 0 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {c.changePct > 0 ? '▲' : '▼'} {Math.abs(c.changePct).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 新品上架频率 */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink">新品上架频率</h3>
          <p className="mt-0.5 text-xs text-ink-muted">按周统计的新品数量</p>
          {weeklyNew.length === 0 ? (
            <p className="py-16 text-center text-xs text-ink-muted">统计范围内暂无新品上架</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={weeklyNew} margin={{ top: 12, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${value} 个新品`, '数量']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#2563EB" fillOpacity={0.85} radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 评分变化趋势 */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-ink">评分变化趋势</h3>
          <p className="mt-0.5 text-xs text-ink-muted">所选竞品的平均评分</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={ratingSeries} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis domain={[3, 5]} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => [Number(value).toFixed(2), '平均评分']}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 异常提醒 */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-ink">异常提醒</h3>
          <span className="text-xs text-ink-muted">
            {anomalies.length > 0 ? `共 ${anomalies.length} 条` : ''}
          </span>
        </div>
        <AnomalyList
          anomalies={anomalies}
          onMarkRead={handleMarkRead}
          onIgnore={handleIgnore}
        />
      </div>
    </div>
  )
}
