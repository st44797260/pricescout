import { useEffect, useRef, useState } from 'react'
import { animate, useMotionValue, useTransform, motion } from 'framer-motion'
import { cn } from '../lib/format.js'

/**
 * 数字滚动动画：从 0 平滑滚动到目标值，值变化时再次滚动；
 * 可选 flash —— 变化时附加颜色闪烁效果。
 * format 自定义显示（如 formatPrice），否则按 decimals 输出。
 */
export default function AnimatedNumber({
  value,
  duration = 1.1,
  decimals = 0,
  format,
  flash = false,
  className,
}) {
  const count = useMotionValue(0)
  const [flashing, setFlashing] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    const controls = animate(count, value ?? 0, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, duration, count])

  useEffect(() => {
    if (!flash || prev.current === value) return undefined
    prev.current = value
    setFlashing(true)
    const timer = setTimeout(() => setFlashing(false), 900)
    return () => clearTimeout(timer)
  }, [value, flash])

  const text = useTransform(count, (v) => {
    if (format) return format(v)
    if (decimals > 0) return v.toFixed(decimals)
    return Math.round(v).toLocaleString('en-US')
  })

  return (
    <motion.span className={cn('tabular-nums', flashing && 'flash-number', className)}>
      {text}
    </motion.span>
  )
}
