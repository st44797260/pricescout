import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  mockAddCompetitor,
  mockAddShortlist,
  mockDeleteCompetitor,
  mockDetectAnomalies,
  mockGetCompetitor,
  mockIgnoreAnomaly,
  mockListAllProducts,
  mockListAnalyses,
  mockListAnomalies,
  mockListCompetitors,
  mockListPricing,
  mockListProducts,
  mockListShortlist,
  mockMarkAnomalyRead,
  mockMarkScraping,
  mockRemoveShortlist,
  mockRunScrape,
  mockSaveAnalyses,
  mockSavePricing,
  mockSnapshotSeries,
} from './mockBackend.js'
import { enrichSimilarCounts, heuristicScore } from './aiScoring.js'
import { heuristicPricing } from './pricing.js'
import {
  SCRAPE_EVENTS,
  decActiveScrapes,
  emitScrapeEvent,
  incActiveScrapes,
} from './scrapeEvents.js'

export { SCRAPE_EVENTS, getActiveScrapeCount, onScrapeEvent } from './scrapeEvents.js'
export { MARKETS } from './pricing.js'

export const PLATFORM_OPTIONS = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'custom', label: '自定义' },
]

export const SORT_OPTIONS = [
  { value: 'ai', label: 'AI推荐指数' },
  { value: 'price', label: '价格' },
  { value: 'rating', label: '评分' },
  { value: 'review_count', label: '评价数' },
]

const ANALYZE_CHUNK_SIZE = 8

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

/** 统一产品行结构：竞品信息拍平到顶层 */
function normalizeProductRow(row) {
  return {
    ...row,
    competitor_name: row.competitor?.name ?? null,
    competitor_platform: row.competitor?.platform ?? null,
    competitor_url: row.competitor?.url ?? null,
  }
}

/**
 * 触发一次采集（新竞品或重新采集）。
 * 立即返回并发布 START 事件；完成/失败时发布对应事件，
 * 页面订阅事件刷新数据，状态条据此计数。
 */
function triggerScrape(competitorId) {
  incActiveScrapes()
  emitScrapeEvent(SCRAPE_EVENTS.START, { competitorId })

  const finish = (type, payload) => {
    decActiveScrapes()
    emitScrapeEvent(type, { competitorId, ...payload })
  }

  const run = async () => {
    if (!isSupabaseConfigured) {
      return { product_count: await mockRunScrape(competitorId), mock: true }
    }
    const { data, error } = await supabase.functions.invoke('scrape-competitor', {
      body: { competitor_id: competitorId },
    })
    if (error) throw new Error(error.message)
    if (data?.success === false) throw new Error(data.error ?? '采集失败')
    return { product_count: data?.product_count ?? 0, mock: Boolean(data?.mock) }
  }

  run()
    .then(({ product_count }) =>
      finish(SCRAPE_EVENTS.COMPLETE, { productCount: product_count }),
    )
    .catch((err) =>
      finish(SCRAPE_EVENTS.ERROR, {
        message: err?.message ?? '未知错误',
      }),
    )
}

/** 规范化用户输入的站点地址：缺省补 https:// */
export function normalizeSiteUrl(input) {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export async function listCompetitors() {
  if (!isSupabaseConfigured) return mockListCompetitors()
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getCompetitor(id) {
  if (!isSupabaseConfigured) return mockGetCompetitor(id)
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

/** 新增竞品并立即在后台触发采集 */
export async function addCompetitor({ name, url, platform }) {
  const siteUrl = normalizeSiteUrl(url)
  let row
  if (!isSupabaseConfigured) {
    row = await mockAddCompetitor({ name, url: siteUrl, platform })
  } else {
    const { data, error } = await supabase
      .from('competitors')
      .insert({ name, url: siteUrl, platform, status: 'scraping' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    row = data
  }
  triggerScrape(row.id)
  return row
}

/** 重新采集：乐观地把状态置为采集中，再触发采集 */
export async function rescrapeCompetitor(id) {
  if (isSupabaseConfigured) {
    await supabase
      .from('competitors')
      .update({ status: 'scraping' })
      .eq('id', id)
  } else {
    await mockMarkScraping(id)
  }
  triggerScrape(id)
}

export async function deleteCompetitor(id) {
  if (!isSupabaseConfigured) return mockDeleteCompetitor(id)
  // products / snapshots 随外键 on delete cascade 一并删除
  const { error } = await supabase.from('competitors').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listProducts(competitorId) {
  if (!isSupabaseConfigured) return mockListProducts(competitorId)
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('scraped_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** 全部竞品的产品（选品分析页数据源），附带竞品名称/平台 */
export async function listAllProducts() {
  if (!isSupabaseConfigured) return mockListAllProducts()
  const { data, error } = await supabase
    .from('products')
    .select('*, competitor:competitors(name, url, platform)')
    .order('scraped_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizeProductRow)
}

// ---------------- AI 选品评分 ----------------

export async function listAnalyses() {
  if (!isSupabaseConfigured) return mockListAnalyses()
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** 把分析结果列表转成 productId → analysis 的映射（同产品取最新一条） */
export function analysesToMap(rows) {
  const map = {}
  for (const row of rows) {
    if (!map[row.product_id]) map[row.product_id] = row
  }
  return map
}

/**
 * 分批对产品执行 AI 评分（每批 8 个），onProgress 上报进度。
 * 未配置 Supabase 时在前端直接执行启发式评分（与 Edge Function 兜底一致）。
 * 返回全部分析结果数组。
 */
export async function analyzeProductsBatch(products, onProgress) {
  if (products.length === 0) return []
  const enriched = enrichSimilarCounts(products)
  const chunks = chunkArray(enriched, ANALYZE_CHUNK_SIZE)
  const results = []
  const total = enriched.length

  for (const chunk of chunks) {
    onProgress?.({ done: results.length, total })
    if (!isSupabaseConfigured) {
      await delay(450 + Math.random() * 450)
      const scored = chunk.map((p) => heuristicScore(p, enriched))
      await mockSaveAnalyses(scored)
      results.push(...scored)
    } else {
      const { data, error } = await supabase.functions.invoke('analyze-products', {
        body: {
          products: chunk.map((p) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            rating: p.rating,
            review_count: p.review_count,
            competitor_name: p.competitor_name,
            similar_count: p.similar_count,
          })),
        },
      })
      if (error) throw new Error(error.message)
      if (data?.success === false) throw new Error(data.error ?? 'AI 分析失败')
      results.push(...(data?.results ?? []))
    }
    onProgress?.({ done: results.length, total })
  }
  return results
}

// ---------------- 选品清单 ----------------

export async function listShortlist() {
  if (!isSupabaseConfigured) return mockListShortlist()
  const { data, error } = await supabase
    .from('shortlist')
    .select('id, product_id, note, created_at, product:products(*, competitor:competitors(name, url, platform))')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((row) => row.product)
    .map((row) => ({ ...row, product: normalizeProductRow(row.product) }))
}

export async function addToShortlist(productId, note = null) {
  if (!isSupabaseConfigured) return mockAddShortlist(productId, note)
  const { error } = await supabase
    .from('shortlist')
    .upsert({ product_id: productId, note }, { onConflict: 'product_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function removeFromShortlist(productId) {
  if (!isSupabaseConfigured) return mockRemoveShortlist(productId)
  const { error } = await supabase
    .from('shortlist')
    .delete()
    .eq('product_id', productId)
  if (error) throw new Error(error.message)
}

// ---------------- 智能定价 ----------------

/**
 * 生成定价建议。
 * 未配置 Supabase 时在前端执行启发式定价（与 Edge Function 兜底算法一致）。
 */
export async function suggestPricing(input) {
  if (!isSupabaseConfigured) {
    await delay(1200 + Math.random() * 800) // 模拟 AI 思考耗时
    const products = await mockListAllProducts()
    return heuristicPricing(input, products)
  }
  const { data, error } = await supabase.functions.invoke('suggest-pricing', {
    body: input,
  })
  if (error) throw new Error(error.message)
  if (data?.success === false) throw new Error(data.error ?? '定价分析失败')
  return data.suggestion
}

/** 保存定价方案到 pricing_suggestions 表 */
export async function savePricingSuggestion(suggestion, input) {
  const row = {
    product_name: input.product_name,
    cost: input.cost,
    target_margin: input.target_margin,
    shipping_cost: input.shipping_cost,
    platform_fee: input.platform_fee,
    suggested_price_low: suggestion.price_low,
    suggested_price_recommended: suggestion.price_recommended,
    suggested_price_high: suggestion.price_high,
    strategy_text: suggestion.strategy_text,
    competitor_distribution: {
      ...suggestion.distribution,
      percentile: suggestion.percentile,
      risks: suggestion.risks,
      market: input.market,
    },
  }
  if (!isSupabaseConfigured) return mockSavePricing(row)
  const { data, error } = await supabase
    .from('pricing_suggestions')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** 定价历史行归一化：competitor_distribution 中的扩展字段拍平到顶层 */
function normalizePricingRow(row) {
  return {
    ...row,
    market: row.competitor_distribution?.market ?? 'global',
    percentile: row.competitor_distribution?.percentile ?? null,
    risks: row.competitor_distribution?.risks ?? [],
    distribution: row.competitor_distribution ?? {},
  }
}

/** 定价历史 */
export async function listPricingSuggestions() {
  if (!isSupabaseConfigured) {
    const rows = await mockListPricing()
    return rows.map(normalizePricingRow)
  }
  const { data, error } = await supabase
    .from('pricing_suggestions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizePricingRow)
}

// ---------------- 趋势监控与异常检测 ----------------

/**
 * 快照时间序列（近 days 天），统一行结构：
 * { date, price, rating, review_count, competitor_id, competitor_name, product_id, product_title }
 */
export async function getSnapshotSeries(days) {
  if (!isSupabaseConfigured) return mockSnapshotSeries(days)
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('snapshots')
    .select(
      'snapshot_date, price, rating, review_count, product:products(id, title, competitor_id, competitor:competitors(id, name))',
    )
    .gte('snapshot_date', since)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((r) => r.product && r.product.competitor)
    .map((r) => ({
      date: r.snapshot_date,
      price: r.price,
      rating: r.rating,
      review_count: r.review_count,
      competitor_id: r.product.competitor_id,
      competitor_name: r.product.competitor.name,
      product_id: r.product.id,
      product_title: r.product.title,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeAnomaly(row) {
  return {
    ...row,
    product_title: row.product?.title ?? row.product_title ?? '已下架产品',
    competitor_name: row.competitor?.name ?? row.competitor_name ?? '未知竞品',
  }
}

export async function listAnomalies() {
  if (!isSupabaseConfigured) return mockListAnomalies()
  const { data, error } = await supabase
    .from('anomalies')
    .select('*, product:products(title), competitor:competitors(name)')
    .order('detected_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(normalizeAnomaly)
}

/** 运行异常检测（Edge Function detect-anomalies），返回新发现条数 */
export async function detectAnomalies(competitorId = null) {
  if (!isSupabaseConfigured) {
    return { detected: await mockDetectAnomalies(competitorId) }
  }
  const { data, error } = await supabase.functions.invoke('detect-anomalies', {
    body: { competitor_id: competitorId },
  })
  if (error) throw new Error(error.message)
  if (data?.success === false) throw new Error(data.error ?? '异常检测失败')
  return { detected: data?.detected ?? 0 }
}

export async function markAnomalyRead(id) {
  if (!isSupabaseConfigured) return mockMarkAnomalyRead(id)
  const { error } = await supabase.from('anomalies').update({ is_read: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function ignoreAnomaly(id) {
  if (!isSupabaseConfigured) return mockIgnoreAnomaly(id)
  const { error } = await supabase.from('anomalies').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
