import { useState } from 'react'
import { Check, ChevronDown, Star, Store } from 'lucide-react'
import { cn, formatNumber, formatPrice } from '../lib/format.js'
import { DIMENSIONS, scoreTone } from '../lib/aiScoring.js'
import ProductImage from './ProductImage.jsx'
import ScoreRing from './ScoreRing.jsx'

/**
 * 选品分析产品卡片：
 * 左图 / 中间信息 / 右侧推荐指数环 + 四维度迷你条 / 底部 AI 理由（可展开）。
 * 点击卡片打开详情抽屉；点击底部理由区域只做展开/收起。
 */
export default function ProductCard({ product, analysis, inShortlist, onOpen }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="card card-hover cursor-pointer p-4"
      onClick={() => onOpen(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(product)
      }}
    >
      <div className="flex gap-4">
        <ProductImage
          src={product.image_url}
          alt={product.title}
          className="h-20 w-20 shrink-0"
        />

        {/* 中间：标题 + 来源 + 价格行 */}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-5 text-ink" title={product.title}>
            {product.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
            <Store className="h-3 w-3" />
            <span className="truncate">{product.competitor_name ?? '未知竞品'}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lg font-semibold tabular-nums text-ink">
              {formatPrice(product.price)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-muted">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {product.rating != null ? Number(product.rating).toFixed(1) : '—'}
            </span>
            <span className="text-xs tabular-nums text-ink-muted">
              {formatNumber(product.review_count)} 评价
            </span>
            {inShortlist && (
              <span className="badge ml-auto bg-blue-50 text-blue-700 ring-blue-200">
                <Check className="h-3 w-3" />
                已入清单
              </span>
            )}
          </div>
        </div>

        {/* 右侧：推荐指数环 + 四维度迷你条 */}
        <div className="flex w-28 shrink-0 flex-col items-center">
          <ScoreRing value={analysis?.total_score ?? null} size={64} />
          <div className="mt-1.5 w-full space-y-1">
            {analysis &&
              DIMENSIONS.map((dim) => {
                const score = Number(analysis.scores?.[dim.key] ?? 0)
                const tone = scoreTone(score)
                return (
                  <div key={dim.key} className="flex items-center gap-1.5" title={`${dim.label} ${score}`}>
                    <span className="w-6 shrink-0 text-[10px] leading-none text-ink-muted">
                      {dim.short}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', tone.bar)}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <span className="w-5 shrink-0 text-right text-[10px] leading-none tabular-nums text-slate-400">
                      {score}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* 底部：AI 理由（点击展开） */}
      {analysis ? (
        <div
          className="mt-3 border-t border-slate-100 pt-2"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <p className={cn('text-xs leading-5 text-ink-muted', !expanded && 'truncate')}>
            {analysis.reason}
          </p>
          <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-blue-600">
            {expanded ? '收起' : '展开完整理由'}
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
            />
          </span>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-xs text-slate-400">
            暂无 AI 评分，点击右上角「开始AI分析」为筛选结果批量评分。
          </p>
        </div>
      )}
    </div>
  )
}
