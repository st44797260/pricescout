import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight,
  Check,
  History,
  Loader2,
  Star,
  Tag,
} from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { listPricingSuggestions, MARKETS } from '../lib/api.js'
import { marginPct, netProfit } from '../lib/pricing.js'
import { cn, formatDateTime, formatPrice } from '../lib/format.js'

const MAX_COMPARE = 3

export default function PricingHistory() {
  const [rows, setRows] = useState(null) // null = 加载中
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  const load = useCallback(async () => {
    try {
      setRows(await listPricingSuggestions())
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载定价历史失败')
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_COMPARE) return prev
      return [...prev, id]
    })
  }

  const compared = useMemo(
    () => (rows ?? []).filter((r) => selectedIds.includes(r.id)),
    [rows, selectedIds],
  )

  if (rows === null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="定价历史"
        description="保存过的定价方案都在这里，勾选 2-3 个方案可横向对比。"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 方案对比 */}
      {compared.length >= 2 && <CompareTable plans={compared} />}

      {/* 方案列表 */}
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={History}
            title="还没有保存过定价方案"
            description="在定价助手生成建议后点击「保存定价方案」，即可在这里回顾与对比。"
          >
            <Link to="/pricing" className="btn btn-primary">
              去定价助手
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const selected = selectedIds.includes(row.id)
            const rec = Number(row.suggested_price_recommended)
            const net = netProfit(rec, Number(row.cost), Number(row.shipping_cost), Number(row.platform_fee))
            const margin = marginPct(rec, Number(row.cost), Number(row.shipping_cost), Number(row.platform_fee))
            const marketLabel =
              MARKETS.find((m) => m.value === row.market)?.label ?? row.market
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggleSelect(row.id)}
                className={cn(
                  'card card-hover block w-full cursor-pointer p-4 text-left transition-colors',
                  selected && 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-200',
                )}
                title={selected ? '点击取消选择' : '点击加入对比'}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h3 className="text-sm font-semibold text-ink">{row.product_name}</h3>
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                    {marketLabel}
                  </span>
                  {selected && (
                    <span className="badge bg-blue-600 text-white ring-blue-600">
                      <Check className="h-3 w-3" />
                      已选入对比
                    </span>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-slate-400">
                    {formatDateTime(row.created_at)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-ink-muted">
                  <span>成本 {formatPrice(row.cost)}</span>
                  <span>物流 {formatPrice(row.shipping_cost)}</span>
                  <span>佣金 {Number(row.platform_fee)}%</span>
                  <span>目标利润率 {Number(row.target_margin)}%</span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="inline-flex items-baseline gap-1 text-sm">
                    <span className="text-xs text-slate-400">建议区间</span>
                    <span className="font-medium tabular-nums text-ink">
                      {formatPrice(row.suggested_price_low)} – {formatPrice(row.suggested_price_high)}
                    </span>
                  </span>
                  <span className="inline-flex items-baseline gap-1">
                    <Tag className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-lg font-bold tabular-nums text-blue-700">
                      {formatPrice(rec)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-sm tabular-nums',
                      net >= 0 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    净利润 {formatPrice(net)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm tabular-nums text-ink-muted">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    实际利润率 {margin.toFixed(1)}%
                  </span>
                  {row.percentile != null && (
                    <span className="text-xs text-slate-400">
                      高于 {row.percentile}% 竞品
                    </span>
                  )}
                  <span
                    className={cn(
                      'ml-auto flex h-4 w-4 items-center justify-center rounded border transition-colors',
                      selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white',
                    )}
                  >
                    {selected && <Check className="h-3 w-3 text-white" />}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 多方案横向对比表（最多 {MAX_COMPARE} 列） */
function CompareTable({ plans }) {
  const metrics = useMemo(() => {
    const rows = plans.map((p) => {
      const rec = Number(p.suggested_price_recommended)
      return {
        id: p.id,
        net: netProfit(rec, Number(p.cost), Number(p.shipping_cost), Number(p.platform_fee)),
        margin: marginPct(rec, Number(p.cost), Number(p.shipping_cost), Number(p.platform_fee)),
      }
    })
    const bestNet = Math.max(...rows.map((r) => r.net))
    return { rows, bestNet }
  }, [plans])

  const lines = [
    { label: '产品成本', get: (p) => formatPrice(p.cost) },
    { label: '物流成本', get: (p) => formatPrice(p.shipping_cost) },
    { label: '平台佣金', get: (p) => `${Number(p.platform_fee)}%` },
    { label: '目标利润率', get: (p) => `${Number(p.target_margin)}%` },
    { label: '最低建议价', get: (p) => formatPrice(p.suggested_price_low) },
    {
      label: '推荐价',
      get: (p) => (
        <span className="font-semibold text-blue-700">
          {formatPrice(p.suggested_price_recommended)}
        </span>
      ),
    },
    { label: '最高建议价', get: (p) => formatPrice(p.suggested_price_high) },
    {
      label: '推荐价净利润',
      get: (p, i) => (
        <span
          className={cn(
            'tabular-nums',
            metrics.rows[i].net >= 0 ? 'text-emerald-600' : 'text-red-600',
            metrics.rows[i].net === metrics.bestNet && plans.length > 1 && 'font-bold',
          )}
        >
          {formatPrice(metrics.rows[i].net)}
        </span>
      ),
    },
    {
      label: '实际利润率',
      get: (p, i) => <span className="tabular-nums">{metrics.rows[i].margin.toFixed(1)}%</span>,
    },
    {
      label: '竞品定位',
      get: (p) => (p.percentile != null ? `高于 ${p.percentile}%` : '—'),
    },
  ]

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <ArrowLeftRight className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-ink">方案对比</h2>
        <span className="text-xs text-ink-muted">
          （最多 {MAX_COMPARE} 个，净利润最高的已加粗）
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-4 py-2.5 font-medium">指标</th>
              {plans.map((p) => (
                <th key={p.id} className="px-4 py-2.5 font-medium">
                  <span className="text-ink">{p.product_name}</span>
                  <span className="ml-1.5 text-slate-400">
                    {MARKETS.find((m) => m.value === p.market)?.label ?? ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{line.label}</td>
                {plans.map((p, i) => (
                  <td key={p.id} className="px-4 py-2 tabular-nums text-ink">
                    {line.get(p, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
