import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/format.js'

/**
 * 数值变化时的颜色闪烁效果（百分比、涨跌幅等）。
 * format 自定义显示；首次挂载不闪烁。
 */
export default function FlashNumber({ value, format, className }) {
  const [flashing, setFlashing] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (prev.current === value) return undefined
    prev.current = value
    setFlashing(true)
    const timer = setTimeout(() => setFlashing(false), 900)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <span className={cn('inline-block tabular-nums', flashing && 'flash-number', className)}>
      {format ? format(value) : value}
    </span>
  )
}
