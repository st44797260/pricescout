import { motion } from 'framer-motion'
import AnimatedNumber from './AnimatedNumber.jsx'
import { cn } from '../lib/format.js'

const TONES = {
  primary: 'bg-blue-50 text-blue-600',
  accent: 'bg-orange-50 text-orange-600',
  warning: 'bg-amber-50 text-amber-600',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
}

/**
 * 数据概览统计卡片：图标（hover 微放大）+ 滚动数字 + 标签。
 * value 为数值时滚动动画；flash 为 true 时数值变化伴随颜色闪烁。
 */
export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'primary',
  index = 0,
  decimals = 0,
  format,
  flash = false,
}) {
  const numeric = typeof value === 'number' && Number.isFinite(value)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06, ease: 'easeOut' }}
      className="card card-hover group flex items-center gap-4 p-5"
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110',
          TONES[tone] ?? TONES.primary,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-2xl font-semibold tracking-tight text-ink">
          {numeric ? (
            <AnimatedNumber value={value} decimals={decimals} format={format} flash={flash} />
          ) : (
            value
          )}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">
          {label}
          {sub && <span className="ml-1 text-xs text-slate-400">{sub}</span>}
        </div>
      </div>
    </motion.div>
  )
}
