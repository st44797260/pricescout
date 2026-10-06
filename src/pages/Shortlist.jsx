import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Download, Star, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ProductImage from '../components/ProductImage.jsx'
import {
  listAnalyses,
  listShortlist,
  PLATFORM_OPTIONS,
  removeFromShortlist,
} from '../lib/api.js'
import { scoreTone } from '../lib/aiScoring.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import { cn, formatDateTime, formatNumber, formatPrice } from '../lib/format.js'

function platformLabel(value) {
  return PLATFORM_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—'
}

export default function Shortlist() {
  const [rows, setRows] = useState(null) // null = 加载中
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [shortlistRows, analysisRows] = await Promise.all([
        listShortlist(),
        listAnalyses(),
      ])
      const analysisMap = {}
      for (const row of analysisRows) {
        if (!analysisMap[row.product_id]) analysisMap[row.product_id] = row
      }
      setRows(
        shortlistRows.map((row) => ({
          ...row,
          total_score: analysisMap[row.product_id]?.total_score ?? null,
        })),
      )
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载选品清单失败')
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleRemove = async (productId) => {
    try {
      await removeFromShortlist(productId)
      load()
    } catch (err) {
      setError(err?.message ?? '移除失败')
    }
  }

  const handleExport = () => {
    if (!rows || rows.length === 0) return
    const headers = [
      '产品标题', '竞品来源', '平台', '价格(USD)', '评分', '评价数',
      'AI推荐指数', '备注', '加入时间',
    ]
    const data = rows.map((r) => [
      r.product.title,
      r.product.competitor_name ?? '',
      platformLabel(r.product.competitor_platform),
      r.product.price ?? '',
      r.product.rating ?? '',
      r.product.review_count ?? '',
      r.total_score ?? '',
      r.note ?? '',
      formatDateTime(r.created_at),
    ])
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`pricescout-选品清单-${date}.csv`, toCsv(headers, data))
  }

  const avgScore = useMemo(() => {
    if (!rows || rows.length === 0) return null
    const scored = rows.filter((r) => r.total_score != null)
    if (scored.length === 0) return null
    return (
      scored.reduce((s, r) => s + Number(r.total_score), 0) / scored.length
    ).toFixed(1)
  }, [rows])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="选品清单"
          description={
            rows && rows.length > 0
              ? `已收藏 ${rows.length} 个产品${avgScore ? `，平均 AI 推荐指数 ${avgScore}` : ''}。`
              : '收藏 AI 分析中看好的产品，支持一键导出 CSV。'
          }
        />
        <button
          type="button"
          className="btn btn-outline mb-6"
          onClick={handleExport}
          disabled={!rows || rows.length === 0}
        >
          <Download className="h-4 w-4" />
          导出 CSV
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="flex justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bookmark}
            title="清单还是空的"
            description="在选品分析中打开产品详情抽屉，点击「加入选品清单」即可收藏。"
          >
            <Link to="/products" className="btn btn-primary">
              去选品分析
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const tone = row.total_score != null ? scoreTone(row.total_score) : null
            const p = row.product
            return (
              <div key={row.id} className="card card-hover flex items-center gap-4 p-4">
                <ProductImage src={p.image_url} alt={p.title} className="h-14 w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-ink" title={p.title}>
                    {p.product_url ? (
                      <a
                        href={p.product_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-blue-600"
                      >
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums text-ink-muted">
                    <span className="text-slate-400">{p.competitor_name ?? '未知竞品'}</span>
                    <span className="font-medium text-ink">{formatPrice(p.price)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {p.rating != null ? Number(p.rating).toFixed(1) : '—'}
                    </span>
                    <span>{formatNumber(p.review_count)} 评价</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {row.note ? `备注：${row.note} · ` : ''}加入于 {formatDateTime(row.created_at)}
                  </p>
                </div>
                {row.total_score != null && (
                  <span className={cn('badge shrink-0', tone.chip)}>
                    AI {Math.round(Number(row.total_score))} 分
                  </span>
                )}
                <button
                  type="button"
                  title="移出清单"
                  onClick={() => handleRemove(row.product_id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
