import { generateMockProducts } from './mockData.js'
import { enrichSimilarCounts, heuristicScore } from './aiScoring.js'
import { heuristicPricing } from './pricing.js'

/**
 * 本地模拟后端（localStorage 持久化）。
 * 未配置 VITE_SUPABASE_* 环境变量时，api.js 会把所有调用路由到这里，
 * 模拟与 Supabase + Edge Function 相同的数据流：
 * - 竞品采集：新建竞品（采集中）→ 延迟后写入 20 条产品 + 快照 → 已完成
 * - AI 分析：直接在前端执行启发式评分（与 analyze-products 兜底算法一致）
 * - 选品清单：localStorage 存储，支持加入/移出/导出
 */

const STORAGE_KEY = 'pricescout.mockdb.v1'
const MOCK_SCRAPE_MIN_MS = 2200
const MOCK_SCRAPE_EXTRA_MS = 1500

function originOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).origin
  } catch {
    return ''
  }
}

function emptyStore() {
  return {
    competitors: [],
    products: {},
    snapshots: {},
    analyses: {},
    shortlist: {},
    pricing: [],
  }
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedStore()
    const store = JSON.parse(raw)
    return {
      competitors: store.competitors ?? [],
      products: store.products ?? {},
      snapshots: store.snapshots ?? {},
      analyses: store.analyses ?? {},
      shortlist: store.shortlist ?? {},
      pricing: store.pricing ?? [],
    }
  } catch {
    return seedStore()
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function uuid() {
  return crypto.randomUUID()
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString()
}

/**
 * 首次访问时写入示例数据：
 * - 三条竞品，覆盖 已完成 / 失败 两种状态
 * - 已完成竞品的产品预跑一遍启发式 AI 评分
 * - 选品清单预置两个高分会选产品
 */
function seedStore() {
  const store = emptyStore()
  const demos = [
    {
      name: '示例 · UrbanPaws 宠物用品',
      url: 'https://urbanpaws-demo.com',
      platform: 'shopify',
      status: 'completed',
      scrapedHoursAgo: 3,
      productCount: 20,
    },
    {
      name: '示例 · NordHome 家居',
      url: 'https://nordhome-demo.com',
      platform: 'woocommerce',
      status: 'completed',
      scrapedHoursAgo: 26,
      productCount: 14,
    },
    {
      name: '示例 · FitGear 健身',
      url: 'https://fitgear-demo.com',
      platform: 'custom',
      status: 'failed',
      scrapedHoursAgo: 50,
      productCount: 0,
    },
  ]

  const allProducts = []
  for (const demo of demos) {
    const id = uuid()
    const scrapedAt = hoursAgo(demo.scrapedHoursAgo)
    store.competitors.push({
      id,
      name: demo.name,
      url: demo.url,
      platform: demo.platform,
      product_count: demo.productCount,
      last_scraped_at: demo.status === 'completed' ? scrapedAt : null,
      status: demo.status,
      created_at: hoursAgo(demo.scrapedHoursAgo + 2),
    })

    if (demo.status !== 'completed') continue
    const origin = originOf(demo.url)
    const products = generateMockProducts(demo.productCount, origin).map((p) => ({
      id: uuid(),
      competitor_id: id,
      scraped_at: scrapedAt,
      ...p,
    }))
    store.products[id] = products
    const today = new Date().toISOString().slice(0, 10)
    store.snapshots[id] = products.map((p) => ({
      id: uuid(),
      product_id: p.id,
      price: p.price,
      rating: p.rating,
      review_count: p.review_count,
      snapshot_date: today,
    }))
    allProducts.push(...products)
  }

  // 预填充 AI 分析结果（全批次上下文下的启发式评分）
  const enriched = enrichSimilarCounts(allProducts)
  for (const p of enriched) {
    const result = heuristicScore(p, enriched)
    store.analyses[p.id] = {
      product_id: p.id,
      scores: result.scores,
      total_score: result.total_score,
      reason: result.reason,
      created_at: p.scraped_at,
    }
  }

  // 预置两个不同竞品的高分产品到选品清单
  const ranked = [...enriched]
    .sort((a, b) => store.analyses[b.id].total_score - store.analyses[a.id].total_score)
  const pickedCompetitors = new Set()
  let picked = 0
  for (const p of ranked) {
    if (picked >= 2) break
    if (pickedCompetitors.has(p.competitor_id)) continue
    pickedCompetitors.add(p.competitor_id)
    store.shortlist[p.id] = {
      id: uuid(),
      product_id: p.id,
      note: picked === 0 ? '高分优先验证款' : '利润款候选',
      created_at: hoursAgo(1),
    }
    picked += 1
  }

  // 预置两条定价方案（用启发式算法对示例输入计算），供定价历史页演示
  const pricingDemos = [
    {
      demo: {
        product_name: 'Insulated Water Bottle',
        cost: 6.5,
        target_margin: 35,
        shipping_cost: 3.2,
        platform_fee: 15,
        market: 'us',
      },
      hours: 22,
    },
    {
      demo: {
        product_name: 'LED Strip Lights',
        cost: 4.2,
        target_margin: 40,
        shipping_cost: 2.8,
        platform_fee: 15,
        market: 'sea',
      },
      hours: 70,
    },
  ]
  for (const { demo, hours } of pricingDemos) {
    const suggestion = heuristicPricing(demo, allProducts)
    store.pricing.push({
      id: uuid(),
      product_name: demo.product_name,
      cost: demo.cost,
      target_margin: demo.target_margin,
      shipping_cost: demo.shipping_cost,
      platform_fee: demo.platform_fee,
      suggested_price_low: suggestion.price_low,
      suggested_price_recommended: suggestion.price_recommended,
      suggested_price_high: suggestion.price_high,
      strategy_text: suggestion.strategy_text,
      competitor_distribution: {
        ...suggestion.distribution,
        percentile: suggestion.percentile,
        risks: suggestion.risks,
        market: demo.market,
      },
      created_at: hoursAgo(hours),
    })
  }

  saveStore(store)
  return store
}

function replaceProducts(store, competitorId, products, scrapedAt) {
  const old = store.products[competitorId] ?? []
  delete store.snapshots[competitorId]
  store.products[competitorId] = products.map((p) => ({
    id: uuid(),
    competitor_id: competitorId,
    scraped_at: scrapedAt,
    ...p,
  }))
  const today = new Date().toISOString().slice(0, 10)
  store.snapshots[competitorId] = store.products[competitorId].map((p) => ({
    id: uuid(),
    product_id: p.id,
    price: p.price,
    rating: p.rating,
    review_count: p.review_count,
    snapshot_date: today,
  }))
  // 旧产品被替换，其历史分析结果与清单项一并失效
  for (const p of old) {
    delete store.analyses[p.id]
    delete store.shortlist[p.id]
  }
}

// ---------------- 竞品与产品 ----------------

export async function mockListCompetitors() {
  await delay(150)
  const store = loadStore()
  return [...store.competitors].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
}

export async function mockGetCompetitor(id) {
  await delay(100)
  return loadStore().competitors.find((c) => c.id === id) ?? null
}

export async function mockAddCompetitor({ name, url, platform }) {
  await delay(250)
  const store = loadStore()
  const competitor = {
    id: uuid(),
    name,
    url,
    platform,
    product_count: 0,
    last_scraped_at: null,
    status: 'scraping',
    created_at: new Date().toISOString(),
  }
  store.competitors.push(competitor)
  saveStore(store)
  return competitor
}

/** 模拟一次采集：延迟后全量替换 20 条产品并写入快照，返回产品数量 */
export async function mockRunScrape(competitorId) {
  await delay(MOCK_SCRAPE_MIN_MS + Math.random() * MOCK_SCRAPE_EXTRA_MS)
  const store = loadStore()
  const competitor = store.competitors.find((c) => c.id === competitorId)
  if (!competitor) return 0 // 采集期间被删除，静默取消

  const scrapedAt = new Date().toISOString()
  const products = generateMockProducts(20, originOf(competitor.url))
  replaceProducts(store, competitorId, products, scrapedAt)

  competitor.product_count = products.length
  competitor.last_scraped_at = scrapedAt
  competitor.status = 'completed'
  saveStore(store)
  return products.length
}

export async function mockMarkScraping(competitorId) {
  const store = loadStore()
  const competitor = store.competitors.find((c) => c.id === competitorId)
  if (competitor) {
    competitor.status = 'scraping'
    saveStore(store)
  }
}

export async function mockDeleteCompetitor(id) {
  await delay(200)
  const store = loadStore()
  for (const p of store.products[id] ?? []) {
    delete store.analyses[p.id]
    const sl = Object.entries(store.shortlist).find(
      ([, item]) => item.product_id === p.id,
    )
    if (sl) delete store.shortlist[sl[0]]
  }
  delete store.products[id]
  delete store.snapshots[id]
  store.competitors = store.competitors.filter((c) => c.id !== id)
  saveStore(store)
}

export async function mockListProducts(competitorId) {
  await delay(150)
  const store = loadStore()
  return [...(store.products[competitorId] ?? [])].sort((a, b) =>
    (b.scraped_at ?? '').localeCompare(a.scraped_at ?? ''),
  )
}

/** 全部产品（附带竞品信息），供选品分析页使用 */
export async function mockListAllProducts() {
  await delay(200)
  const store = loadStore()
  const byId = new Map(store.competitors.map((c) => [c.id, c]))
  const rows = []
  for (const [competitorId, list] of Object.entries(store.products)) {
    const competitor = byId.get(competitorId)
    for (const p of list) {
      rows.push({
        ...p,
        competitor_name: competitor?.name ?? null,
        competitor_platform: competitor?.platform ?? null,
        competitor_url: competitor?.url ?? null,
      })
    }
  }
  return rows.sort((a, b) => (b.scraped_at ?? '').localeCompare(a.scraped_at ?? ''))
}

// ---------------- AI 分析结果 ----------------

export async function mockSaveAnalyses(results) {
  const store = loadStore()
  for (const r of results) {
    store.analyses[r.product_id] = {
      product_id: r.product_id,
      scores: r.scores,
      total_score: r.total_score,
      reason: r.reason,
      created_at: new Date().toISOString(),
    }
  }
  saveStore(store)
}

export async function mockListAnalyses() {
  await delay(100)
  return Object.values(loadStore().analyses).sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )
}

// ---------------- 选品清单 ----------------

export async function mockAddShortlist(productId, note = null) {
  const store = loadStore()
  if (!store.shortlist[productId]) {
    store.shortlist[productId] = {
      id: uuid(),
      product_id: productId,
      note,
      created_at: new Date().toISOString(),
    }
    saveStore(store)
  }
  return store.shortlist[productId]
}

export async function mockRemoveShortlist(productId) {
  const store = loadStore()
  delete store.shortlist[productId]
  saveStore(store)
}

/** 清单行（附带产品与竞品信息） */
export async function mockListShortlist() {
  await delay(150)
  const store = loadStore()
  const rows = []
  for (const item of Object.values(store.shortlist)) {
    let product = null
    for (const [competitorId, list] of Object.entries(store.products)) {
      const found = list.find((p) => p.id === item.product_id)
      if (found) {
        const competitor = store.competitors.find((c) => c.id === competitorId)
        product = {
          ...found,
          competitor_name: competitor?.name ?? null,
          competitor_platform: competitor?.platform ?? null,
        }
        break
      }
    }
    if (!product) continue // 产品已被重新采集替换，清单项失效
    rows.push({ ...item, product })
  }
  return rows.sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )
}

// ---------------- 定价方案 ----------------

export async function mockSavePricing(row) {
  await delay(300)
  const store = loadStore()
  const saved = { ...row, id: uuid(), created_at: new Date().toISOString() }
  store.pricing.push(saved)
  saveStore(store)
  return saved
}

export async function mockListPricing() {
  await delay(150)
  return [...loadStore().pricing].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  )
}
