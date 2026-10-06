import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, Radar, Send, X } from 'lucide-react'
import { cn } from '../lib/format.js'
import { listChatLogs, sendChatMessage } from '../lib/api.js'

const WELCOME =
  '你好！我是 PriceScout 助手 👋\n可以问我：\n· 选品评分是怎么算的？\n· 怎么定价比较合理？\n· 竞品监控该怎么配置？'

/**
 * AI 助手：右下角悬浮球（脉冲光晕）+ 400×600 对话窗口，支持流式输出。
 */
export default function AssistantChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState(null) // null = 未加载
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const listRef = useRef(null)
  const loadedRef = useRef(false)

  // 首次打开时加载历史记录
  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    listChatLogs()
      .then((logs) =>
        setMessages(
          logs.length > 0
            ? logs.map((l) => ({ role: l.role, content: l.content }))
            : [{ role: 'assistant', content: WELCOME }],
        ),
      )
      .catch(() => setMessages([{ role: 'assistant', content: WELCOME }]))
  }, [open])

  // 新消息自动滚到底部
  useEffect(() => {
    if (messages === null) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMessages((m) => [
      ...(m ?? []),
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ])
    setStreaming(true)
    try {
      await sendChatMessage({
        message: text,
        onChunk: (chunk) => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, content: last.content + chunk }
            return copy
          })
        },
      })
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        copy[copy.length - 1] = {
          ...last,
          content: `${last.content}\n[出错了：${err?.message ?? '未知错误'}]`,
        }
        return copy
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <>
      {/* 悬浮按钮（蓝色渐变 + 脉冲光晕） */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? '关闭 AI 助手' : '打开 AI 助手'}
        className="print-hide fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/40 transition-transform hover:scale-105 active:scale-95"
      >
        {!open && (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-blue-500 opacity-30" />
        )}
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* 对话窗口 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="print-hide fixed bottom-24 right-6 z-50 flex h-[600px] max-h-[calc(100vh-120px)] w-[400px] max-w-[calc(100vw-48px)] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-label="PriceScout 助手"
          >
            {/* 标题栏 */}
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-white">
              <Radar className="h-5 w-5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">PriceScout 助手</p>
                <p className="flex items-center gap-1 text-[11px] text-blue-100">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  在线 · 解答选品与定价问题
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 transition-colors hover:bg-white/20"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 消息列表 */}
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {messages === null ? (
                <div className="flex justify-center py-10">
                  <LoaderPlaceholder />
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6',
                        m.role === 'user'
                          ? 'rounded-br-sm bg-blue-600 text-white'
                          : 'rounded-bl-sm border border-slate-200 bg-white text-ink shadow-sm',
                      )}
                    >
                      {m.content}
                      {streaming && m.role === 'assistant' && i === messages.length - 1 && (
                        <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-text-bottom" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 输入区 */}
            <form
              className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
              onSubmit={handleSend}
            >
              <input
                type="text"
                className="input flex-1"
                placeholder="输入你的问题…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
              />
              <button
                type="submit"
                className="btn btn-primary px-3"
                disabled={streaming || !input.trim()}
                aria-label="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function LoaderPlaceholder() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
  )
}
