import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Loader2, PackageSearch, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import MultiSelect from '../components/MultiSelect.jsx'
import RangeSlider, { SingleSlider } from '../components/RangeSlider.jsx'
import ProductCard from '../components/ProductCard.jsx'
import ProductDrawer from '../components/ProductDrawer.jsx'
import PulseNodes from '../components/PulseNodes.jsx'
import { SkeletonCards } from '../components/Skeleton.jsx'
import {
  addToShortlist,
  analyzeProductsBatch,
  analysesToMap,
  listAllProducts,
  listAnalyses,
  listShortlist,
  removeFromShortlist,
  SORT_OPTIONS,
} from '../lib/api.js'

export default function Products() {
  const [products, setProducts] = useState(null) // null = 加载中
  const [analyses, setAnalyses] = useState({})
  const [shortlistIds, setShortlistIds] = useState(() => new Set())
  const [error, setError] = useState('')

  // 筛选状态
  const [competitorIds, setCompetitorIds] = useState([])
  const [priceBounds, setPriceBounds] = useState([0, 100])
  const [priceRange, setPriceRange] = useState([0, 100])
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState('ai')

  // AI 分析状态
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }

  // 详情抽屉
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    try {
      const [productRows, analysisRows, shortlistRows] = await Promise.all([
        listAllProducts(),
        listAnalyses(),
        listShortlist(),
      ])
      setProducts(productRows)
      setAnalyses(analysesToMap(analysisRows))
      setShortlistIds(new Set(shortlistRows.map((r) => r.product_id)))
      setError('')
    } catch (err) {
      setError(err?.message ?? '加载数据失败')
      setProducts([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 根据数据初始化价格区间边界
  useEffect(() => {
    if (!products) return
    const prices = products
      .map((p) => Number(p.price))
      .filter((v) => Number.isFinite(v) && v > 0)
    const lo = prices.length ? Math.max(0, Math.floor(Math.min(...prices))) : 0
    const hi = prices.length ? Math.ceil(Math.max(...prices)) : 100
    setPriceBounds([lo, hi])
    setPriceRange([lo, hi])
  }, [products])

  const competitorOptions = useMemo(() => {
    if (!products) return []
    const seen = new Map()
    for (const p of products) {
      if (p.competitor_id && !seen.has(p.competitor_id)) {
        seen.set(p.competitor_id, p.competitor_name ?? p.competitor_id)
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }))
  }, [products])

  const filtered = useMemo(() => {
    if (!products) return []
    const [lo, hi] = priceRange
    const [boundLo, boundHi] = priceBounds
    const priceFiltered = priceRange[0] > boundLo || priceRange[1] < boundHi
    return products.filter((p) => {
      if (competitorIds.length > 0 && !competitorIds.includes(p.competitor_id)) return false
      const price = Number(p.price)
      if (Number.isFinite(price) && price > 0) {
        if (price < lo || price > hi) return false
      } else if (priceFiltered) {
        return false // 无价格的产品只在未启用价格筛选时保留
      }
      if (minRating > 0 && !(Number(p.rating) >= minRating)) return false
      return true
    })
  }, [products, competitorIds, priceRange, priceBounds, minRating])

  const sorted = useMemo(() => {
    const value = (p) => {
      if (sortBy === 'price') return Number(p.price ?? -1)
      if (sortBy === 'rating') return Number(p.rating ?? -1)
      if (sortBy === 'review_count') return Number(p.review_count ?? -1)
      const analysis = analyses[p.id]
      return analysis ? Number(analysis.total_score) : -1 // 未分析的排最后
    }
    return [...filtered].sort((a, b) => value(b) - value(a))
  }, [filtered, sortBy, analyses])

  const analyzedCount = useMemo(
    () => filtered.filter((p) => analyses[p.id]).length,
    [filtered, analyses],
  )

  const handleAnalyze = async () => {
    if (analyzing || filtered.length === 0) return
    setAnalyzing(true)
    setError('')
    setProgress({ done: 0, total: filtered.length })
    try {
      const results = await analyzeProductsBatch(filtered, ({ done, total }) =>
        setProgress({ done, total }),
      )
      setAnalyses((prev) => ({ ...prev, ...analysesToMap(results) }))
      setSortBy('ai') // 分析完成后按 AI 推荐指数排序
    } catch (err) {
      setError(err?.message ?? 'AI 分析失败')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setProgress(null), 1500)
    }
  }

  const handleToggleShortlist = async (product) => {
    if (shortlistIds.has(product.id)) {
      await removeFromShortlist(product.id)
      setShortlistIds((prev) => {
        const next = new Set(prev)
        next.delete(product.id)
        return next
      })
    } else {
      await addToShortlist(product.id)
      setShortlistIds((prev) => new Set(prev).add(product.id))
    }
  }

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="选品分析"
          description="跨竞品筛选产品，AI 多维度评分帮你找到值得上架的款。"
        />
        <Link to="/products/shortlist" className="btn btn-outline mb-6">
          <ClipboardList className="h-4 w-4" />
          选品清单
          <span className="ml-0.5 rounded-full bg-blue-50 px-1.5 text-xs font-semibold tabular-nums text-blue-700">
            {shortlistIds.size}
          </span>
        </Link>
      </div>

      {/* 筛选栏 */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="w-52">
            <label className="mb-1 block text-xs font-medium text-ink-muted">竞品筛选</label>
            <MultiSelect
              options={competitorOptions}
              value={competitorIds}
              onChange={setCompetitorIds}
              allLabel="全部竞品"
            />
          </div>

          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-ink-muted">价格区间</label>
            <RangeSlider
              min={priceBounds[0]}
              max={priceBounds[1]}
              step={1}
              value={priceRange}
              onChange={setPriceRange}
            />
          </div>

          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-ink-muted">最低评分</label>
            <SingleSlider
              min={0}
              max={5}
              step={0.5}
              value={minRating}
              onChange={setMinRating}
              formatValue={(v) => v.toFixed(1)}
            />
          </div>

          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-ink-muted">排序方式</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn-ai ml-auto"
            onClick={handleAnalyze}
            disabled={analyzing || filtered.length === 0}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analyzing ? '分析中…' : '开始AI分析'}
          </button>
        </div>
      </div>

      {/* AI 分析进度条 */}
      {progress && (
        <div className="card mt-4 p-4">
          <PulseNodes className="mb-3" />
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-ink">
              {analyzing && <Loader2 className="h-4 w-4 animate-spin text-violet-600" />}
              {analyzing
                ? `正在分析 ${progress.done}/${progress.total} 个产品…`
                : `分析完成，共 ${progress.total} 个产品`}
            </span>
            <span className="tabular-nums text-ink-muted">{progressPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 列表 */}
      {products === null ? (
        <SkeletonCards count={4} className="mt-4" />
      ) : products.length === 0 ? (
        <div className="card mt-4">
          <EmptyState
            illustration="search"
            icon={PackageSearch}
            title="暂无产品数据"
            description="先到竞品管理添加竞品并完成采集，这里就会有可分析的产品。"
          >
            <Link to="/competitors" className="btn btn-primary">
              去竞品管理
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <span>
              共 <span className="font-medium text-ink">{filtered.length}</span> 个产品
              <span className="ml-2">
                · 已分析 <span className="font-medium text-ink">{analyzedCount}</span> 个
              </span>
            </span>
            {filtered.length !== products.length && (
              <button
                type="button"
                className="text-blue-600 transition-colors hover:text-blue-700"
                onClick={() => {
                  setCompetitorIds([])
                  setPriceRange(priceBounds)
                  setMinRating(0)
                }}
              >
                重置筛选
              </button>
            )}
          </div>

          {sorted.length === 0 ? (
            <div className="card mt-3">
              <EmptyState
                illustration="search"
                icon={PackageSearch}
                title="没有符合筛选条件的产品"
                description="放宽价格区间、评分或竞品范围试试。"
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {sorted.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  analysis={analyses[p.id]}
                  inShortlist={shortlistIds.has(p.id)}
                  onOpen={setSelected}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 详情抽屉 */}
      <ProductDrawer
        product={selected}
        analysis={selected ? analyses[selected.id] : null}
        inShortlist={selected ? shortlistIds.has(selected.id) : false}
        onToggleShortlist={handleToggleShortlist}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
