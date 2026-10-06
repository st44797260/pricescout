import { motion } from 'framer-motion'
import { cn } from '../lib/format.js'

const TONES = {
  primary: 'bg-blue-50 text-blue-600',
  accent: 'bg-orange-50 text-orange-600',
  warning: 'bg-amber-50 text-amber-600',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-600',
}

/** 数据概览统计卡片：图标 + 数值 + 标签 */
export default function StatCard({ label, value, sub, icon: Icon, tone = 'primary', index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06, ease: 'easeOut' }}
      className="card card-hover flex items-center gap-4 p-5"
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
          TONES[tone] ?? TONES.primary,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-2xl font-semibold tracking-tight text-ink tabular-nums">
          {value}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">
          {label}
          {sub && <span className="ml-1 text-xs text-slate-400">{sub}</span>}
        </div>
      </div>
    </motion.div>
  )
}
