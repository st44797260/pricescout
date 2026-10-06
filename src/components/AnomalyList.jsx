import { Check, X } from 'lucide-react'
import { cn, formatDateTime } from '../lib/format.js'
import { ANOMALY_TYPES, formatChange } from '../lib/trends.js'

/**
 * 异常事件列表（趋势监控页与数据看板共用）。
 * 每条：类型徽章、产品、竞品、时间、变化幅度；未读高亮，支持标记已读 / 忽略。
 */
export default function AnomalyList({
  anomalies,
  onMarkRead,
  onIgnore,
  limit,
  emptyText = '暂无异常事件，点击「运行异常检测」扫描最近两次快照。',
}) {
  const list = limit ? anomalies.slice(0, limit) : anomalies

  if (list.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-ink-muted">{emptyText}</p>
  }

  return (
    <div>
      {list.map((a) => {
        const meta = ANOMALY_TYPES[a.type] ?? { label: a.type, color: '#64748B' }
        return (
          <div
            key={a.id}
            className={cn(
              'flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0',
              !a.is_read && 'bg-blue-50/40',
            )}
          >
            <span
              className="badge mt-0.5 shrink-0 text-white"
              style={{ background: meta.color }}
            >
              {meta.label}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm', a.is_read ? 'text-ink-muted' : 'font-medium text-ink')}>
                {a.product_title}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-muted" title={a.description}>
                {a.competitor_name} · {formatDateTime(a.detected_at)}
                <span className="ml-1.5 text-slate-400">{a.description}</span>
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 text-sm font-semibold tabular-nums',
                a.type === 'price_drop' || a.type === 'rating_drop'
                  ? 'text-red-600'
                  : a.type === 'price_rise'
                    ? 'text-orange-600'
                    : 'text-blue-600',
              )}
            >
              {formatChange(a.type, a.change_value)}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {a.is_read ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Check className="h-3.5 w-3.5" />
                  已读
                </span>
              ) : (
                onMarkRead && (
                  <button
                    type="button"
                    title="标记已读"
                    onClick={() => onMarkRead(a)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )
              )}
              {onIgnore && (
                <button
                  type="button"
                  title="忽略（删除该提醒）"
                  onClick={() => onIgnore(a)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
