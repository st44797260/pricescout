import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkCheck, BookmarkPlus, ExternalLink, Loader2, Star, X } from 'lucide-react'
import { cn, formatDateTime, formatNumber, formatPrice } from '../lib/format.js'
import { DIMENSIONS, scoreTone } from '../lib/aiScoring.js'
import { PlatformBadge } from './Badges.jsx'
import ProductImage from './ProductImage.jsx'
import ScoreRing from './ScoreRing.jsx'

/**
 * 产品详情抽屉（从右侧滑入）：
 * 完整产品信息、四维度评分与解释、完整 AI 理由、加入/移出选品清单。
 */
export default function ProductDrawer({ product, analysis, inShortlist, onToggleShortlist, onClose }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!product) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [product, onClose])

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onToggleShortlist(product)
    } finally {
      setBusy(false)
    }
  }

  const tone = analysis ? scoreTone(analysis.total_score) : null

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* 头部 */}
            <div className="flex items-start gap-3 border-b border-slate-200 p-5">
              <ProductImage
                src={product.image_url}
                alt={product.title}
                className="h-16 w-16 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-6 text-ink">{product.title}</h2>
                <p className="mt-1 text-xs text-ink-muted">{product.competitor_name ?? '未知竞品'}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 内容 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="card p-4">
                <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2.5 text-sm">
                  <dt className="text-ink-muted">竞品来源</dt>
                  <dd className="flex items-center gap-2">
                    <span className="truncate text-ink">{product.competitor_name ?? '—'}</span>
                    <PlatformBadge platform={product.competitor_platform} />
                  </dd>
                  <dt className="text-ink-muted">价格</dt>
                  <dd className="font-medium tabular-nums text-ink">{formatPrice(product.price)}</dd>
                  <dt className="text-ink-muted">评分</dt>
                  <dd className="inline-flex items-center gap-1 tabular-nums text-ink">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {product.rating != null ? Number(product.rating).toFixed(1) : '—'}
                    <span className="text-xs text-slate-400">/ 5.0</span>
                  </dd>
                  <dt className="text-ink-muted">评价数</dt>
                  <dd className="tabular-nums text-ink">{formatNumber(product.review_count)}</dd>
                  <dt className="text-ink-muted">采集时间</dt>
                  <dd className="tabular-nums text-ink-muted">{formatDateTime(product.scraped_at)}</dd>
                  {product.product_url && (
                    <>
                      <dt className="text-ink-muted">产品链接</dt>
                      <dd>
                        <a
                          href={product.product_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          打开详情页
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {analysis ? (
                <div className="mt-4">
                  {/* 综合指数 */}
                  <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50/60 py-5">
                    <ScoreRing value={analysis.total_score} size={96} />
                    <span className={cn('badge mt-3', tone.chip)}>
                      {tone.label}
                    </span>
                    <p className="mt-1 text-xs text-ink-muted">AI 综合推荐指数</p>
                  </div>

                  {/* 四维度明细 */}
                  <div className="mt-4 space-y-3.5">
                    {DIMENSIONS.map((dim) => {
                      const score = Number(analysis.scores?.[dim.key] ?? 0)
                      const dimTone = scoreTone(score)
                      return (
                        <div key={dim.key}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-ink">
                              {dim.label}
                              {dim.hint && (
                                <span className="ml-1.5 text-xs font-normal text-slate-400">
                                  {dim.hint}
                                </span>
                              )}
                            </span>
                            <span className={cn('font-semibold tabular-nums', dimTone.text)}>
                              {score}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn('h-full rounded-full transition-all duration-500', dimTone.bar)}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-ink-muted">
                            {analysis.scores?.notes?.[dim.key] || '—'}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {/* 完整理由 */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <h3 className="text-sm font-semibold text-ink">AI 分析理由</h3>
                    <p className="mt-1.5 text-sm leading-6 text-ink-muted">{analysis.reason}</p>
                    {analysis.scores?.model && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        评分模型：{analysis.scores.model}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm text-ink-muted">
                    该产品尚未进行 AI 分析。回到列表页点击「开始AI分析」即可批量评分。
                  </p>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="border-t border-slate-200 p-5">
              {inShortlist ? (
                <button
                  type="button"
                  className="btn btn-outline w-full"
                  onClick={handleToggle}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkCheck className="h-4 w-4" />
                  )}
                  移出选品清单
                </button>
              ) : (
                <button type="button" className="btn btn-primary w-full" onClick={handleToggle} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  加入选品清单
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
