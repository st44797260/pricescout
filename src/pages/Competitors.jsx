import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ExternalLink,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import AddCompetitorModal from '../components/AddCompetitorModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { PlatformBadge, StatusBadge } from '../components/Badges.jsx'
import { SortHeader } from '../components/SortHeader.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import {
  deleteCompetitor,
  listCompetitors,
  onScrapeEvent,
  rescrapeCompetitor,
  SCRAPE_EVENTS,
} from '../lib/api.js'
import { compareBy, useSort } from '../hooks/useSort.js'
import { cn, formatDateTime, formatNumber } from '../lib/format.js'

const COLUMNS = [
  { key: 'name', label: '竞品名称', sortable: true },
  { key: 'url', label: 'URL' },
  { key: 'platform', label: '平台类型' },
  { key: 'product_count', label: '产品数量', sortable: true },
  { key: 'last_scraped_at', label: '最后采集时间', sortable: true },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作' },
]

export default function Competitors() {
  const navigate = useNavigate()
  const [competitors, setCompetitors] = useState(null) // null = 加载中
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, toggleSort] = useSort('created_at', 'desc')
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setCompetitors(await listCompetitors())
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载竞品列表失败')
      setCompetitors([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 采集开始/完成/失败时刷新列表（状态、产品数量实时更新）
  useEffect(() => {
    const offs = Object.values(SCRAPE_EVENTS).map((type) =>
      onScrapeEvent(type, load),
    )
    return () => offs.forEach((off) => off())
  }, [load])

  const visible = useMemo(() => {
    if (!competitors) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? competitors.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.url.toLowerCase().includes(q),
        )
      : competitors
    return [...filtered].sort(compareBy(sort.key, sort.dir))
  }, [competitors, query, sort])

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteCompetitor(pendingDelete.id)
      setPendingDelete(null)
      load()
    } catch (err) {
      setError(err?.message ?? '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleRescrape = (c) => {
    if (c.status === 'scraping') return
    rescrapeCompetitor(c.id)
  }

  const loading = competitors === null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="竞品管理"
          description="跟踪竞品独立站的产品、价格与评价数据。"
        />
        <button type="button" className="btn btn-primary mb-6" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          添加竞品
        </button>
      </div>

      <div className="card overflow-hidden">
        {/* 工具条：搜索 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="text-sm text-ink-muted">
            共 <span className="font-medium text-ink">{visible.length}</span> 个竞品
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="搜索名称或 URL…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* 加载骨架 */}
        {loading && <SkeletonRows rows={4} cols={7} />}

        {/* 空状态 */}
        {!loading && visible.length === 0 && (
          query ? (
            <EmptyState
              illustration="search"
              icon={Search}
              title="没有匹配的竞品"
              description="换个关键词试试，或清空搜索条件。"
            />
          ) : (
            <EmptyState
              illustration="radar"
              icon={Store}
              title="还没有竞品"
              description="添加第一个竞品独立站，开始自动采集它的产品与价格数据。"
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                添加竞品
              </button>
            </EmptyState>
          )
        )}

        {/* 数据：桌面表格 */}
        {!loading && visible.length > 0 && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="px-4 py-3">
                        {col.sortable ? (
                          <SortHeader
                            label={col.label}
                            column={col.key}
                            sort={sort}
                            onToggle={toggleSort}
                          />
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/competitors/${c.id}`)}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3.5 font-medium text-ink">{c.name}</td>
                      <td className="max-w-[220px] px-4 py-3.5">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex max-w-full items-center gap-1 text-blue-600 hover:underline"
                        >
                          <span className="truncate">{c.url}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <PlatformBadge platform={c.platform} />
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-ink">
                        {c.status === 'scraping' ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            统计中
                          </span>
                        ) : (
                          formatNumber(c.product_count)
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-ink-muted">
                        {formatDateTime(c.last_scraped_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="查看详情"
                            onClick={() => navigate(`/competitors/${c.id}`)}
                            className="hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            title={c.status === 'scraping' ? '采集中…' : '重新采集'}
                            disabled={c.status === 'scraping'}
                            onClick={() => handleRescrape(c)}
                            className="hover:bg-slate-100 hover:text-slate-700"
                          >
                            <RefreshCw
                              className={cn('h-4 w-4', c.status === 'scraping' && 'animate-spin')}
                            />
                          </IconButton>
                          <IconButton
                            title="删除"
                            onClick={() => setPendingDelete(c)}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 数据：移动端卡片列表 */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {visible.map((c) => (
                <div
                  key={c.id}
                  className="cursor-pointer p-4 transition-colors hover:bg-slate-50"
                  onClick={() => navigate(`/competitors/${c.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <span className="truncate">{c.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                    <PlatformBadge platform={c.platform} />
                    <span>
                      {c.status === 'scraping' ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          统计中
                        </span>
                      ) : (
                        `${formatNumber(c.product_count)} 产品`
                      )}
                    </span>
                    <span>{formatDateTime(c.last_scraped_at)}</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2.5">
                    <IconButton
                      title="查看详情"
                      onClick={() => navigate(`/competitors/${c.id}`)}
                      className="hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Eye className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title={c.status === 'scraping' ? '采集中…' : '重新采集'}
                      disabled={c.status === 'scraping'}
                      onClick={() => handleRescrape(c)}
                      className="hover:bg-slate-100 hover:text-slate-700"
                    >
                      <RefreshCw
                        className={cn('h-4 w-4', c.status === 'scraping' && 'animate-spin')}
                      />
                    </IconButton>
                    <IconButton
                      title="删除"
                      onClick={() => setPendingDelete(c)}
                      className="hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AddCompetitorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={load}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除竞品"
        description={`确定删除「${pendingDelete?.name ?? ''}」吗？该竞品下的所有产品与价格快照数据将一并删除，此操作不可恢复。`}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

function IconButton({ title, onClick, className, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      disabled={disabled}
      className={cn(
        'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}
