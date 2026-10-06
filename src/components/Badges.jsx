import { Loader2 } from 'lucide-react'
import { cn } from '../lib/format.js'

const STATUS_MAP = {
  pending: { label: '待采集', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  scraping: { label: '采集中', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  completed: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  failed: { label: '失败', className: 'bg-red-50 text-red-700 ring-red-200' },
}

const PLATFORM_MAP = {
  shopify: { label: 'Shopify', className: 'bg-green-50 text-green-700 ring-green-200' },
  woocommerce: { label: 'WooCommerce', className: 'bg-purple-50 text-purple-700 ring-purple-200' },
  custom: { label: '自定义', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

const BASE = 'badge'

export function StatusBadge({ status }) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending
  return (
    <span className={cn(BASE, config.className)}>
      {status === 'scraping' && <Loader2 className="h-3 w-3 animate-spin" />}
      {config.label}
    </span>
  )
}

export function PlatformBadge({ platform }) {
  const config = PLATFORM_MAP[platform] ?? PLATFORM_MAP.custom
  return <span className={cn(BASE, config.className)}>{config.label}</span>
}
