import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { AlertTriangle, ArrowRight, Package, Sparkles, Store } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import AnomalyList from '../components/AnomalyList.jsx'
import {
  getSnapshotSeries,
  ignoreAnomaly,
  listAllProducts,
  listAnomalies,
  listAnalyses,
  listCompetitors,
  markAnomalyRead,
} from '../lib/api.js'
import { ANOMALY_TYPES, overallSeries } from '../lib/trends.js'
import { cn } from '../lib/format.js'

const KPI_TONES = {
  primary: 'bg-blue-50 text-blue-600',
  accent: 'bg-orange-50 text-orange-600',
  danger: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
}

const PIE_COLORS = Object.fromEntries(
  Object.entries(ANOMALY_TYPES).map(([key, meta]) => [key, meta.color]),
)

// 本周起始（周一），模块级计算一次即可
const WEEK_START = (() => {
  const d = new Date()
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
})()

export default function Dashboard() {
  const [competitors, setCompetitors] = useState(null)
  const [products, setProducts] = useState(null)
  const [anomalies, setAnomalies] = useState(null)
  const [analysesCount, setAnalysesCount] = useState(0)
  const [seriesRows, setSeriesRows] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [competitorRows, productRows, anomalyRows, analysisRows, series] =
        await Promise.all([
          listCompetitors(),
          listAllProducts(),
          listAnomalies(),
          listAnalyses(),
          getSnapshotSeries(90),
        ])
      setCompetitors(competitorRows)
      setProducts(productRows)
      setAnomalies(anomalyRows)
      setAnalysesCount(analysisRows.length)
      setSeriesRows(series)
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载看板数据失败')
      setCompetitors([])
      setProducts([])
      setAnomalies([])
      setSeriesRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const weeklyAnomalyCount = useMemo(
    () =>
      (anomalies ?? []).filter(
        (a) => String(a.detected_at).slice(0, 10) >= WEEK_START,
      ).length,
    [anomalies],
  )

  const priceSeries = useMemo(
    () => overallSeries(seriesRows ?? [], 'price'),
    [seriesRows],
  )

  const anomalyTypeData = useMemo(() => {
    const counts = {}
    for (const a of anomalies ?? []) {
      counts[a.type] = (counts[a.type] ?? 0) + 1
    }
    return Object.entries(ANOMALY_TYPES)
      .map(([type, meta]) => ({ type, name: meta.label, value: counts[type] ?? 0 }))
      .filter((d) => d.value > 0)
  }, [anomalies])

  const totalAnomalies = (anomalies ?? []).length

  const kpis = [
    { label: '监控竞品数', value: competitors?.length ?? 0, icon: Store, tone: 'primary' },
    { label: '追踪产品数', value: products?.length ?? 0, icon: Package, tone: 'accent' },
    { label: '本周异常事件', value: weeklyAnomalyCount, icon: AlertTriangle, tone: 'danger' },
    { label: 'AI 分析次数', value: analysesCount, icon: Sparkles, tone: 'violet' },
  ]

  return (
    <div>
      <PageHeader
        title="数据看板"
        description="竞品监控、AI 分析与异常事件的总览。"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, i) => (
          <div key={kpi.label} className="card card-hover flex items-center gap-4 p-5">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                KPI_TONES[kpi.tone],
              )}
            >
              <kpi.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold tracking-tight text-ink">
                <AnimatedNumber value={kpi.value} duration={0.9 + i * 0.12} />
              </div>
              <div className="mt-0.5 text-sm text-ink-muted">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 两个图表 */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">价格趋势总览</h3>
            <span className="text-xs text-ink-muted">全部竞品平均售价 · 近 90 天</span>
          </div>
          {priceSeries.length === 0 ? (
            <p className="py-20 text-center text-sm text-ink-muted">
              暂无快照数据，先到竞品管理完成一次采集。
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={priceSeries} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fontSize: 11, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [formatPrice(value), '平均售价']}
                  labelFormatter={(label) => format(new Date(`${label}T00:00:00`), 'yyyy-MM-dd')}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">异常事件类型分布</h3>
            <span className="text-xs text-ink-muted">累计 {totalAnomalies} 条</span>
          </div>
          {anomalyTypeData.length === 0 ? (
            <p className="py-20 text-center text-sm text-ink-muted">
              暂无异常事件，可到趋势监控页运行异常检测。
            </p>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={anomalyTypeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="85%"
                    paddingAngle={2}
                    strokeWidth={2}
                  >
                    {anomalyTypeData.map((d) => (
                      <Cell key={d.type} fill={PIE_COLORS[d.type]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} 条`, name]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                {anomalyTypeData.map((d) => (
                  <span key={d.type} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[d.type] }} />
                    {d.name} {d.value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 最近异常事件 */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-ink">最近异常事件</h3>
          </div>
          <Link
            to="/trends"
            className="inline-flex items-center gap-1 text-sm text-blue-600 transition-colors hover:text-blue-700"
          >
            查看全部
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <AnomalyList
          anomalies={anomalies ?? []}
          limit={5}
          onMarkRead={async (a) => {
            await markAnomalyRead(a.id)
            setAnomalies((prev) =>
              (prev ?? []).map((x) => (x.id === a.id ? { ...x, is_read: true } : x)),
            )
          }}
          onIgnore={async (a) => {
            await ignoreAnomaly(a.id)
            setAnomalies((prev) => (prev ?? []).filter((x) => x.id !== a.id))
          }}
        />
      </div>
    </div>
  )
}
