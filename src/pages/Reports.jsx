import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, FileBarChart, Plus } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import GenerateReportModal from '../components/GenerateReportModal.jsx'
import { SkeletonBlock } from '../components/Skeleton.jsx'
import { listCompetitors, listReports } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'

export default function Reports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState(null) // null = 加载中
  const [competitorOptions, setCompetitorOptions] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setReports(await listReports())
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载报告列表失败')
      setReports([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 竞品选项（供生成模态框使用）
  useEffect(() => {
    listCompetitors()
      .then((rows) =>
        setCompetitorOptions(rows.map((c) => ({ value: c.id, label: c.name }))),
      )
      .catch(() => setCompetitorOptions([]))
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="报告中心"
          description="一键生成选品分析报告，支持导出 PDF 分享给团队。"
        />
        <button type="button" className="btn btn-primary mb-6" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          生成选品报告
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {reports === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card space-y-3 p-5">
              <SkeletonBlock className="h-5 w-1/3" />
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card">
          <EmptyState
            illustration="report"
            icon={FileBarChart}
            title="还没有报告"
            description="配置竞品范围与产品数量，生成一份包含 AI 执行摘要的选品分析报告。"
          >
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              生成选品报告
            </button>
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const config = report.content?.config ?? {}
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => navigate(`/reports/${report.id}`)}
                className="card card-hover block w-full cursor-pointer p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <FileBarChart className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-ink">{report.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      生成于 {formatDateTime(report.created_at)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-muted">
                  {report.summary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                    TOP {config.top_n ?? 10}
                  </span>
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                    {(report.content?.competitors ?? []).length} 个竞品
                  </span>
                  {config.include_pricing && (
                    <span className="badge bg-blue-50 text-blue-700 ring-blue-200">定价建议</span>
                  )}
                  {config.include_trends && (
                    <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-200">
                      趋势分析
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <GenerateReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        competitors={competitorOptions}
      />
    </div>
  )
}
