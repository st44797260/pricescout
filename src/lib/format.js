import { format } from 'date-fns'
import { clsx } from 'clsx'

/** 合并 className（clsx 薄封装，便于统一入口） */
export function cn(...inputs) {
  return clsx(...inputs)
}

/** 价格显示：$12.34，空值为 — */
export function formatPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `$${Number(value).toFixed(2)}`
}

/** 整数千分位：12,345 */
export function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('en-US')
}

/** 时间显示：2026-10-06 14:30，空值为 从未采集 */
export function formatDateTime(value) {
  if (!value) return '从未采集'
  try {
    return format(new Date(value), 'yyyy-MM-dd HH:mm')
  } catch {
    return '—'
  }
}
