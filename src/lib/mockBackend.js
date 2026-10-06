import { generateMockProducts } from './mockData.js'

/**
 * 本地模拟后端（localStorage 持久化）。
 * 未配置 VITE_SUPABASE_* 环境变量时，api.js 会把所有调用路由到这里，
 * 模拟与 Supabase + Edge Function 相同的数据流：
 * 新建竞品（采集中）→ 延迟后写入 20 条产品 + 快照 → 已完成。
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
  return { competitors: [], products: {}, snapshots: {} }
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

/** 首次访问时写入三条示例竞品，覆盖 已完成 / 失败 两种状态 */
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

  for (const demo of demos) {
    const id = uuid()
    const scrapedAt = hoursAgo(demo.scrapedHoursAgo)
    const competitor = {
      id,
      name: demo.name,
      url: demo.url,
      platform: demo.platform,
      product_count: demo.productCount,
      last_scraped_at: demo.status === 'completed' ? scrapedAt : null,
      status: demo.status,
      created_at: hoursAgo(demo.scrapedHoursAgo + 2),
    }
    store.competitors.push(competitor)

    if (demo.status === 'completed') {
      const origin = originOf(demo.url)
      const products = generateMockProducts(demo.productCount, origin).map(
        (p) => ({
          id: uuid(),
          competitor_id: id,
          scraped_at: scrapedAt,
          ...p,
        }),
      )
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
    }
  }
  saveStore(store)
  return store
}

function replaceProducts(store, competitorId, products, scrapedAt) {
  const old = store.products[competitorId] ?? []
  for (const p of old) delete store.snapshots[p.id]
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
}

// ---------------- 对外 API（与真实后端同构，均为 async） ----------------

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
  await delay(
    MOCK_SCRAPE_MIN_MS + Math.random() * MOCK_SCRAPE_EXTRA_MS,
  )
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
  for (const p of store.products[id] ?? []) delete store.snapshots[p.id]
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
