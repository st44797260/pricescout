import { motion } from 'framer-motion'
import { scoreTone } from '../lib/aiScoring.js'

/**
 * 推荐指数环形进度条。
 * value: 0-100，未分析时传 null 显示占位。
 */
export default function ScoreRing({ value, size = 72 }) {
  if (value == null) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-2 border-dashed border-slate-200 text-xs text-slate-300"
        style={{ width: size, height: size }}
      >
        未分析
      </div>
    )
  }

  const stroke = 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, Number(value)))
  const tone = scoreTone(pct)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${(circumference * pct) / 100} ${circumference}` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-bold leading-none tabular-nums ${tone.text}`}
          style={{ fontSize: size * 0.3 }}
        >
          {Math.round(pct)}
        </span>
        <span className="mt-0.5 text-[10px] leading-none text-slate-400">AI 指数</span>
      </div>
    </div>
  )
}
