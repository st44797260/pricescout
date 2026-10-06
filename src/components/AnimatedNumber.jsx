import { useEffect } from 'react'
import { animate, useMotionValue, useTransform, motion } from 'framer-motion'

/** 数字滚动动画（KPI 卡片用）：从 0 平滑滚动到目标值 */
export default function AnimatedNumber({ value, duration = 1.1 }) {
  const count = useMotionValue(0)
  const text = useTransform(count, (v) =>
    Math.round(v).toLocaleString('en-US'),
  )

  useEffect(() => {
    const controls = animate(count, value ?? 0, { duration, ease: 'easeOut' })
    return () => controls.stop()
  }, [value, duration, count])

  return <motion.span className="tabular-nums">{text}</motion.span>
}
