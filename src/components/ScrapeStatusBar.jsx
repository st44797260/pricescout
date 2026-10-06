import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import { cn } from '../lib/format.js'
import {
  getActiveScrapeCount,
  onScrapeEvent,
  SCRAPE_EVENTS,
} from '../lib/api.js'

const BAR_STYLES = {
  active: 'border-blue-200 bg-blue-50/95 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50/95 text-emerald-700',
  error: 'border-red-200 bg-red-50/95 text-red-700',
}

/**
 * 全局数据采集状态提示条（悬浮于内容区顶部，不挤压布局）：
 * - 有任务进行中：「正在采集 X 个竞品...」+ 旋转图标
 * - 完成：「采集完成，共获取 X 个产品」，3 秒后自动消失
 * - 失败：红色提示，5 秒后自动消失
 */
export default function ScrapeStatusBar() {
  const [activeCount, setActiveCount] = useState(getActiveScrapeCount())
  const [notice, setNotice] = useState(null) // { type: 'success' | 'error', text }
  const timerRef = useRef(null)

  useEffect(() => {
    const sync = () => setActiveCount(getActiveScrapeCount())
    const offStart = onScrapeEvent(SCRAPE_EVENTS.START, () => {
      sync()
      setNotice(null)
    })
    const offComplete = onScrapeEvent(SCRAPE_EVENTS.COMPLETE, ({ productCount }) => {
      sync()
      setNotice({ type: 'success', text: `采集完成，共获取 ${productCount} 个产品` })
    })
    const offError = onScrapeEvent(SCRAPE_EVENTS.ERROR, ({ message }) => {
      sync()
      setNotice({ type: 'error', text: `采集失败：${message ?? '未知错误'}` })
    })
    return () => {
      offStart()
      offComplete()
      offError()
    }
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    timerRef.current = setTimeout(
      () => setNotice(null),
      notice.type === 'error' ? 5000 : 3000,
    )
    return () => clearTimeout(timerRef.current)
  }, [notice])

  const visible = activeCount > 0 || notice !== null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-6"
        >
          <div
            className={cn(
              'pointer-events-auto flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium shadow-md backdrop-blur',
              activeCount > 0
                ? BAR_STYLES.active
                : BAR_STYLES[notice.type] ?? BAR_STYLES.success,
            )}
            role="status"
            aria-live="polite"
          >
            {activeCount > 0 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                正在采集 {activeCount} 个竞品…
              </>
            ) : (
              <>
                {notice.type === 'error' ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {notice.text}
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="ml-1 rounded p-0.5 transition-colors hover:bg-black/5"
                  aria-label="关闭提示"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
