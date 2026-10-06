import { cn } from '../lib/format.js'

/** 单个脉冲骨架块 */
export function SkeletonBlock({ className }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100', className)} />
}

/** 表格行骨架 */
export function SkeletonRows({ rows = 5, cols = 5, className }) {
  return (
    <div className={className}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-slate-100 px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={c}
              className={cn('h-4 flex-1', c === 0 && 'max-w-[110px]', c === cols - 1 && 'max-w-[72px]')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 选品分析产品卡片骨架（两列网格） */
export function SkeletonCards({ count = 4, className }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 xl:grid-cols-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex gap-4">
            <SkeletonBlock className="h-20 w-20 shrink-0" />
            <div className="flex-1 space-y-2.5 py-1">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-3 w-1/3" />
              <SkeletonBlock className="h-5 w-1/2" />
            </div>
            <SkeletonBlock className="h-16 w-16 shrink-0 rounded-full" />
          </div>
          <SkeletonBlock className="mt-4 h-3 w-full" />
        </div>
      ))}
    </div>
  )
}
