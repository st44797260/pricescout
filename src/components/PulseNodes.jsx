import { cn } from '../lib/format.js'

/**
 * AI 分析节点脉冲动画：读取数据 → AI 评分 → 排序输出。
 * 用于选品分析进度条与定价生成中的加载状态。
 */
export default function PulseNodes({ className }) {
  const steps = ['读取数据', 'AI 评分', '排序输出']
  return (
    <div className={cn('flex items-start justify-center', className)}>
      {steps.map((label, i) => (
        <div key={label} className="flex items-start">
          <div className="flex flex-col items-center gap-1.5">
            <span className="relative flex h-9 w-9 items-center justify-center">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-30"
                style={{ animationDelay: `${i * 0.4}s` }}
              />
              <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-violet-500 bg-violet-50 text-xs font-bold tabular-nums text-violet-600">
                {i + 1}
              </span>
            </span>
            <span className="text-xs text-ink-muted">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="mx-2 mt-[17px] h-0.5 w-10 rounded bg-gradient-to-r from-violet-300 to-violet-200 sm:w-16" />
          )}
        </div>
      ))}
    </div>
  )
}
