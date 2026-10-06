import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Modal from './Modal.jsx'
import MultiSelect from './MultiSelect.jsx'
import { generateReport } from '../lib/api.js'
import { format } from 'date-fns'
import { cn } from '../lib/format.js'

/** 生成报告配置开关 */
function Toggle({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-slate-300"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-slate-200',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/**
 * 生成选品报告配置模态框。
 * 提交后调用 generate-report 汇总数据 + AI 摘要，成功后跳转报告详情页。
 */
export default function GenerateReportModal({ open, onClose, competitors }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    competitor_ids: [],
    top_n: 10,
    include_pricing: true,
    include_trends: true,
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setError('')
      setForm((f) => ({
        ...f,
        title: `选品分析报告 · ${format(new Date(), 'M月d日')}`,
      }))
    }
  }, [open])

  const handleGenerate = async (e) => {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setError('请填写报告标题')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const report = await generateReport({
        title,
        competitor_ids: form.competitor_ids,
        top_n: form.top_n,
        include_pricing: form.include_pricing,
        include_trends: form.include_trends,
      })
      onClose()
      navigate(`/reports/${report.id}`)
    } catch (err) {
      setError(err?.message ?? '报告生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="生成选品报告">
      <form onSubmit={handleGenerate} noValidate>
        <div className="space-y-4">
          <div>
            <label htmlFor="report-title" className="label">
              报告标题 <span className="text-red-500">*</span>
            </label>
            <input
              id="report-title"
              type="text"
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>

          <div>
            <label className="label">选择竞品范围</label>
            <MultiSelect
              options={competitors}
              value={form.competitor_ids}
              onChange={(v) => setForm((f) => ({ ...f, competitor_ids: v }))}
              allLabel="全部竞品"
            />
          </div>

          <div>
            <label className="label">选择产品数量</label>
            <select
              className="input"
              value={form.top_n}
              onChange={(e) => setForm((f) => ({ ...f, top_n: Number(e.target.value) }))}
            >
              <option value={10}>TOP 10</option>
              <option value={20}>TOP 20</option>
              <option value={50}>TOP 50</option>
            </select>
          </div>

          <div className="space-y-2">
            <Toggle
              label="包含定价建议"
              description="汇总最近的智能定价方案与利润测算"
              checked={form.include_pricing}
              onChange={(v) => setForm((f) => ({ ...f, include_pricing: v }))}
            />
            <Toggle
              label="包含趋势分析"
              description="附上近 30 天价格走势与异常事件概览"
              checked={form.include_trends}
              onChange={(v) => setForm((f) => ({ ...f, include_trends: v }))}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中…
              </>
            ) : (
              '生成报告'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
