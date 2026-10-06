import { useState } from 'react'
import { Loader2, Radar } from 'lucide-react'
import Modal from './Modal.jsx'
import { addCompetitor, PLATFORM_OPTIONS } from '../lib/api.js'

const EMPTY_FORM = { name: '', url: '', platform: 'shopify' }

/** 添加竞品模态框：提交后插入数据库并自动触发采集 */
export default function AddCompetitorModal({ open, onClose, onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const reset = () => {
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    const url = form.url.trim()
    if (!name) return setError('请填写竞品名称')
    if (!url) return setError('请填写竞品独立站 URL')
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}/i.test(url.replace(/^https?:\/\//i, ''))) {
      return setError('URL 格式不正确，例如 https://example.com')
    }

    setSubmitting(true)
    setError('')
    try {
      const row = await addCompetitor({ name, url, platform: form.platform })
      reset()
      onClose()
      onAdded?.(row)
    } catch (err) {
      setError(err?.message ?? '创建失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="添加竞品">
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">
          <div>
            <label htmlFor="competitor-name" className="label">
              竞品名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="competitor-name"
              type="text"
              className="input"
              placeholder="例如：GlowLab 官网"
              value={form.name}
              onChange={setField('name')}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="competitor-url" className="label">
              竞品独立站 URL <span className="text-red-500">*</span>
            </label>
            <input
              id="competitor-url"
              type="url"
              className="input"
              placeholder="https://example.com"
              value={form.url}
              onChange={setField('url')}
            />
          </div>

          <div>
            <label htmlFor="competitor-platform" className="label">
              平台类型
            </label>
            <select
              id="competitor-platform"
              className="input"
              value={form.platform}
              onChange={setField('platform')}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Radar className="h-3.5 w-3.5" />
            提交后将自动采集该站点的产品、价格与评价数据
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={handleClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                创建中…
              </>
            ) : (
              '提交并采集'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
