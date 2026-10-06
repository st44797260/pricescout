import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import {
  AlertTriangle,
  ChevronLeft,
  DollarSign,
  Loader2,
  Printer,
  Sparkles,
  Star,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import { getReport } from '../lib/api.js'
import { ANOMALY_TYPES } from '../lib/trends.js'
import { cn, formatDateTime, formatNumber, formatPrice } from '../lib/format.js'

export default function ReportDetail() {
  const { id } = useParams()
  const [report, setReport] = useState(null) // null = 加载中, undefined = 不存在

  useEffect(() => {
    let cancelled = false
    getReport(id)
      .then((r) => {
        if (!cancelled) setReport(r ?? undefined)
      })
      .catch(() => {
        if (!cancelled) setReport(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const content = report?.content ?? {}
  const chartData = (content.trends?.series ?? []).map((d) => ({
    ...d,
    label: d.date.slice(5),
  }))

  if (report === null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (report === undefined) {
    return (
      <div className="card mt-6">
        <EmptyState
          icon={AlertTriangle}
          title="报告不存在"
          description="它可能已被删除，或链接有误。"
        >
          <Link to="/reports" className="btn btn-outline">
            <ChevronLeft className="h-4 w-4" />
            返回报告中心
          </Link>
        </EmptyState>
      </div>
    )
  }

  const config = content.config ?? {}
  const trendInfo = content.trends ?? {}

  return (
    <div className="mx-auto max-w-4xl">
      <div className="print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-blue-600"
        >
          <ChevronLeft className="h-4 w-4" />
          返回报告中心
        </Link>
      </div>

      {/* 报告头部 */}
      <div className="card mt-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600">
              PriceScout · 选品分析报告
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
              {report.title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              生成于 {formatDateTime(report.created_at)}
              {content.model && <span className="ml-2">· 评分模型 {content.model}</span>}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            导出 PDF
          </button>
        </div>

        {/* 监控范围 */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">监控范围：</span>
          {(content.competitors ?? []).map((c) => (
            <span key={c.id} className="badge bg-slate-100 text-slate-600 ring-slate-200">
              {c.name} · {c.product_count} 个产品
            </span>
          ))}
        </div>
      </div>

      {/* AI 执行摘要 */}
      <div className="card mt-4 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-ink">AI 执行摘要</h2>
        </div>
        <p className="mt-3 rounded-lg border-l-4 border-blue-500 bg-blue-50/50 p-4 text-sm leading-7 text-ink">
          {report.summary}
        </p>
      </div>

      {/* 推荐产品 */}
      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">
            推荐产品（TOP {config.top_n ?? 10}）
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            按 AI 综合推荐指数排序（市场需求 30% · 竞争 25% · 利润 25% · 物流 20%）
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-3">排名</th>
                <th className="px-4 py-3">产品</th>
                <th className="px-4 py-3">竞品</th>
                <th className="px-4 py-3 text-right">售价</th>
                <th className="px-4 py-3 text-right">评分</th>
                <th className="px-4 py-3 text-right">评价数</th>
                <th className="px-5 py-3 text-right">AI 指数</th>
              </tr>
            </thead>
            <tbody>
              {(content.top_products ?? []).map((p, i) => {
                const tone =
                  p.total_score >= 80
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : p.total_score >= 60
                      ? 'bg-blue-50 text-blue-700 ring-blue-200'
                      : p.total_score >= 40
                        ? 'bg-orange-50 text-orange-700 ring-orange-200'
                        : 'bg-red-50 text-red-700 ring-red-200'
                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                          i === 0
                            ? 'bg-amber-100 text-amber-700'
                            : i === 1
                              ? 'bg-slate-200 text-slate-600'
                              : i === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'text-slate-400',
                        )}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <span className="block truncate font-medium text-ink" title={p.title}>
                        {p.title}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{p.competitor_name}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                      {formatPrice(p.price)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {p.rating != null ? Number(p.rating).toFixed(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {formatNumber(p.review_count)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.total_score != null ? (
                        <span className={cn('badge justify-end', tone)}>
                          {Math.round(Number(p.total_score))} 分
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {(content.top_products ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-muted">
                    竞品下暂无产品数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 定价建议汇总 */}
      {config.include_pricing && (
        <div className="card mt-4 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
            <DollarSign className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-ink">定价建议汇总</h2>
          </div>
          {(content.pricing ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              暂无已保存的定价方案，可到定价助手生成并保存。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">产品</th>
                    <th className="px-4 py-3 text-right">最低建议价</th>
                    <th className="px-4 py-3 text-right">推荐价</th>
                    <th className="px-4 py-3 text-right">最高建议价</th>
                    <th className="px-4 py-3 text-right">目标利润率</th>
                    <th className="px-5 py-3">竞品定位</th>
                  </tr>
                </thead>
                <tbody>
                  {(content.pricing ?? []).map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="max-w-[220px] truncate px-5 py-3 font-medium text-ink">
                        {p.product_name}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                        {formatPrice(p.suggested_price_low)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700">
                        {formatPrice(p.suggested_price_recommended)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                        {formatPrice(p.suggested_price_high)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                        {Number(p.target_margin)}%
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-muted">
                        {p.competitor_distribution?.percentile != null
                          ? `高于 ${p.competitor_distribution.percentile}% 竞品`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 趋势分析 */}
      {config.include_trends && (
        <div className="card mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">趋势分析</h2>
            <span className="text-xs text-ink-muted">
              近 {trendInfo.window_days ?? 30} 天全部竞品平均售价
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="badge bg-blue-50 text-blue-700 ring-blue-200">
              {trendInfo.change_pct == null
                ? '趋势数据不足'
                : `30 天价格${trendInfo.change_pct >= 0 ? '上行' : '下行'} ${Math.abs(trendInfo.change_pct).toFixed(1)}%`}
            </span>
            {Object.entries(trendInfo.anomaly_counts ?? {}).map(([type, count]) => (
              <span key={type} className="badge bg-slate-100 text-slate-600 ring-slate-200">
                {ANOMALY_TYPES[type]?.label ?? type} {count}
              </span>
            ))}
            {(trendInfo.anomaly_counts
              ? Object.values(trendInfo.anomaly_counts).reduce((s, n) => s + n, 0)
              : 0) === 0 && (
              <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-200">
                无异常事件
              </span>
            )}
          </div>

          {chartData.length >= 2 ? (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="reportPriceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#EEF2F7" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
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
                    labelFormatter={(label) => format(new Date(`2026-${label}T00:00:00`), 'MM月dd日')}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fill="url(#reportPriceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-ink-muted">趋势数据不足</p>
          )}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-400">
        本报告由 PriceScout 自动生成 · 数据截至 {formatDateTime(report.created_at)}
      </p>
    </div>
  )
}
