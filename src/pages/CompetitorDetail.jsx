import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronLeft,
  DollarSign,
  ExternalLink,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Star,
} from 'lucide-react'
import EmptyState from '../components/EmptyState.jsx'
import ProductImage from '../components/ProductImage.jsx'
import StatCard from '../components/StatCard.jsx'
import { PlatformBadge, StatusBadge } from '../components/Badges.jsx'
import { SortHeader } from '../components/SortHeader.jsx'
import { SkeletonRows } from '../components/Skeleton.jsx'
import {
  getCompetitor,
  listProducts,
  onScrapeEvent,
  rescrapeCompetitor,
  SCRAPE_EVENTS,
} from '../lib/api.js'
import { compareBy, useSort } from '../hooks/useSort.js'
import { cn, formatDateTime, formatNumber, formatPrice } from '../lib/format.js'

const COLUMNS = [
  { key: 'image_url', label: '图片' },
  { key: 'title', label: '标题' },
  { key: 'price', label: '价格', sortable: true },
  { key: 'rating', label: '评分', sortable: true },
  { key: 'review_count', label: '评价数', sortable: true },
  { key: 'scraped_at', label: '采集时间', sortable: true },
]

export default function CompetitorDetail() {
  const { id } = useParams()
  const [competitor, setCompetitor] = useState(null) // null = 加载中, undefined = 不存在
  const [products, setProducts] = useState(null)
  const [sort, toggleSort] = useSort('review_count', 'desc')
  const [rescraping, setRescraping] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [c, list] = await Promise.all([getCompetitor(id), listProducts(id).catch(() => [])])
    setCompetitor(c ?? undefined) // undefined 表示竞品不存在
    setProducts(list)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const offs = Object.values(SCRAPE_EVENTS).map((type) => onScrapeEvent(type, load))
    return () => offs.forEach((off) => off())
  }, [load])

  const stats = useMemo(() => {
    const list = products ?? []
    const nums = (key) =>
      list
        .map((p) => Number(p[key]))
        .filter((v) => v != null && !Number.isNaN(v))
    const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
    const prices = nums('price')
    const ratings = nums('rating')
    const reviews = list.reduce((s, p) => s + (Number(p.review_count) || 0), 0)
    return {
      total: list.length,
      avgPrice: avg(prices),
      avgRating: avg(ratings),
      avgReviews: list.length ? reviews / list.length : null,
    }
  }, [products])

  const visibleProducts = useMemo(
    () => [...(products ?? [])].sort(compareBy(sort.key, sort.dir)),
    [products, sort],
  )

  const handleRescrape = () => {
    if (!competitor || competitor.status === 'scraping') return
    setRescraping(true)
    rescrapeCompetitor(id)
    // 事件回流（列表刷新、状态条提示）后解除按钮动画
    setTimeout(() => setRescraping(false), 1200)
  }

  if (competitor === null) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={2} cols={3} className="card p-5" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRows key={i} rows={1} cols={1} className="card p-5" />
          ))}
        </div>
        <SkeletonRows rows={6} cols={6} className="card" />
      </div>
    )
  }

  if (competitor === undefined) {
    return (
      <div className="card mt-6">
        <EmptyState
          illustration="search"
          icon={AlertTriangle}
          title="竞品不存在"
          description="它可能已被删除，或链接有误。"
        >
          <Link to="/competitors" className="btn btn-outline">
            <ChevronLeft className="h-4 w-4" />
            返回竞品列表
          </Link>
        </EmptyState>
      </div>
    )
  }

  const scraping = competitor.status === 'scraping'

  return (
    <div>
      {/* 顶部：返回 + 竞品信息 + 重新采集 */}
      <div className="mb-4">
        <Link
          to="/competitors"
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-blue-600"
        >
          <ChevronLeft className="h-4 w-4" />
          返回竞品列表
        </Link>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{competitor.name}</h1>
            <PlatformBadge platform={competitor.platform} />
            <StatusBadge status={competitor.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <a
              href={competitor.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              {competitor.url}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span>最后采集：{formatDateTime(competitor.last_scraped_at)}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleRescrape}
          disabled={scraping}
        >
          <RefreshCw className={cn('h-4 w-4', (scraping || rescraping) && 'animate-spin')} />
          {scraping ? '采集中…' : '重新采集'}
        </button>
      </div>

      {/* 采集状态横幅 */}
      {scraping && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在采集该竞品的数据，完成后自动刷新…
        </p>
      )}
      {competitor.status === 'failed' && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          上次采集失败，请检查站点是否可访问，或点击「重新采集」重试。
        </p>
      )}

      {/* 数据概览（数值变化时滚动 + 闪烁） */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="产品总数" value={stats.total} icon={Package} tone="primary" flash />
        <StatCard
          index={1}
          label="平均价格"
          value={stats.avgPrice}
          format={formatPrice}
          icon={DollarSign}
          tone="accent"
          flash
        />
        <StatCard
          index={2}
          label="平均评分"
          value={stats.avgRating}
          format={(v) => v.toFixed(1)}
          sub="/ 5.0"
          icon={Star}
          tone="warning"
          flash
        />
        <StatCard
          index={3}
          label="平均评价数"
          value={stats.avgReviews}
          format={(v) => formatNumber(Math.round(v))}
          icon={MessageSquare}
          tone="success"
          flash
        />
      </div>

      {/* 产品列表 */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">产品列表</h2>
          <span className="text-sm text-ink-muted">
            共 <span className="font-medium text-ink">{visibleProducts.length}</span> 个产品
          </span>
        </div>

        {products === null ? (
          <SkeletonRows rows={6} cols={6} />
        ) : visibleProducts.length === 0 ? (
          scraping ? (
            <EmptyState
              icon={Loader2}
              title="数据采集中"
              description="采集完成后，产品列表会自动出现在这里。"
            />
          ) : (
            <EmptyState
              illustration="box"
              icon={Package}
              title="暂无产品数据"
              description="该竞品还没有采集到产品，点击右上角「重新采集」试试。"
            />
          )
        ) : (
          <>
            {/* 桌面表格 */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="px-4 py-3">
                        {col.sortable ? (
                          <SortHeader label={col.label} column={col.key} sort={sort} onToggle={toggleSort} />
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <ProductImage src={p.image_url} alt={p.title} className="h-10 w-10" />
                      </td>
                      <td className="max-w-[320px] px-4 py-3">
                        {p.product_url ? (
                          <a
                            href={p.product_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-medium text-ink hover:text-blue-600"
                            title={p.title}
                          >
                            {p.title}
                          </a>
                        ) : (
                          <span className="block truncate font-medium text-ink" title={p.title}>
                            {p.title}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-ink">
                        {formatPrice(p.price)}
                      </td>
                      <td className="px-4 py-3">
                        {p.rating == null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 tabular-nums text-ink">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {Number(p.rating).toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">
                        {formatNumber(p.review_count)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
                        {formatDateTime(p.scraped_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {visibleProducts.map((p) => (
                <div key={p.id} className="flex gap-3 p-4">
                  <ProductImage src={p.image_url} alt={p.title} className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={p.title}>
                      {p.product_url ? (
                        <a href={p.product_url} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums text-ink-muted">
                      <span className="text-sm font-medium text-ink">{formatPrice(p.price)}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {p.rating != null ? Number(p.rating).toFixed(1) : '—'}
                      </span>
                      <span>{formatNumber(p.review_count)} 评价</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(p.scraped_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
