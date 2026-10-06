import { generateMockProducts } from './mockData.js'
import { enrichSimilarCounts, heuristicScore } from './aiScoring.js'
import { heuristicPricing } from './pricing.js'

/**
 * 本地模拟后端（localStorage 持久化）。
 * 未配置 VITE_SUPABASE_* 环境变量时，api.js 会把所有调用路由到这里，
 * 模拟与 Supabase + Edge Function 相同的数据流：
 * - 竞品采集：新建竞品（采集中）→ 延迟后写入 20 条产品 + 90 天历史快照 → 已完成
 * - AI 分析：前端执行启发式评分（与 analyze-products 兜底算法一致）
 * - 定价：前端执行启发式定价（与 suggest-pricing 兜底算法一致）
 * - 异常检测：本地按 detect-anomalies 同样的规则扫描快照
 */

const STORAGE_KEY = 'pricescout.mockdb.v1'
const MOCK_SCRAPE_MIN_MS = 2200
const MOCK_SCRAPE_EXTRA_MS = 1500
const HISTORY_DAYS = 90
const HISTORY_STEP = 2

const round2 = (v) => Math.round(v * 100) / 100
const fmt = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)

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
    anomalies: [],
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
      anomalies: store.anomalies ?? [],
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

function dateDaysAgo(days) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
}

/**
 * 为一批产品生成 HISTORY_DAYS 天的历史快照（每 HISTORY_STEP 天一个点，末点=当前值）。
 * 价格随机游走并偶发 ≥10% 跳变，评分偶发下滑；异常事件后置派生——
 * 每个产品取"最近一次"满足检测规则的跳变（与 detect-anomalies 规则一致），
 * 因此事件自然分散在近期，趋势页红点与提醒列表都有内容。
 * p.firstSeenDaysAgo < HISTORY_DAYS 视为新品（快照从上架日开始）。
 */
function buildHistory(competitorId, competitorName, products) {
  const rows = []
  const anomalies = []
  for (const p of products) {
    const firstSeen = Math.min(Number(p.firstSeenDaysAgo) || HISTORY_DAYS, HISTORY_DAYS)
    let price = round2(p.price * (0.88 + Math.random() * 0.16))
    let rating =
      p.rating != null
        ? Math.max(3.2, p.rating - (0.1 + Math.random() * 0.3))
        : null
    rating = rating != null ? Math.round(rating * 10) / 10 : null
    let reviews = Math.max(0, Math.round((p.review_count || 0) * (0.5 + Math.random() * 0.2)))
    const productRows = []

    for (let d = firstSeen; d >= 0; d -= HISTORY_STEP) {
      const date = dateDaysAgo(d)
      const isLast = d < HISTORY_STEP
      if (isLast) {
        productRows.push({
          id: uuid(),
          product_id: p.id,
          price: p.price,
          rating: p.rating,
          review_count: p.review_count || 0,
          snapshot_date: date,
        })
        break
      }

      // 价格：14% 概率跳变（±10%~18%），否则小幅随机游走；每步向当前价收敛，
      // 避免末点硬重置造成巨大的假跳变
      if (Math.random() < 0.14) {
        const jumpPct = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8)
        price = price * (1 + jumpPct / 100)
      } else {
        price = price * (1 + (Math.random() - 0.5) * 0.04)
      }
      price = round2(
        Math.min(p.price * 1.6, Math.max(p.price * 0.6, price * 0.82 + p.price * 0.18)),
      )
      // 评分：6% 概率下滑 ≥0.5 分，否则微幅漂移
      if (rating != null) {
        if (Math.random() < 0.06) {
          rating = Math.max(3, Math.round((rating - (0.5 + Math.random() * 0.3)) * 10) / 10)
        } else {
          rating = Math.round(Math.min(5, Math.max(3.2, rating + (Math.random() - 0.5) * 0.08)) * 10) / 10
        }
      }
      reviews += Math.round(Math.random() * 6)
      productRows.push({ id: uuid(), product_id: p.id, price, rating, review_count: reviews, snapshot_date: date })
    }
    rows.push(...productRows)

    // 派生异常：从最近的连续快照对往回找第一条满足规则的（价格跳变 ≥10% 或评分降 ≥0.5）
    let picked = null
    for (let i = productRows.length - 1; i >= 1 && !picked; i--) {
      const curr = productRows[i]
      const prev = productRows[i - 1]
      if (prev.price && curr.price && prev.price !== curr.price) {
        const pct = round2(((curr.price - prev.price) / prev.price) * 100)
        if (pct <= -10) {
          picked = {
            type: 'price_drop',
            change_value: pct,
            description: `「${p.title}」价格从 ${fmt(prev.price)} 降至 ${fmt(curr.price)}，降幅 ${Math.abs(pct).toFixed(1)}%`,
            detected_at: new Date(`${curr.snapshot_date}T09:00:00`).toISOString(),
          }
        } else if (pct >= 10) {
          picked = {
            type: 'price_rise',
            change_value: pct,
            description: `「${p.title}」价格从 ${fmt(prev.price)} 涨至 ${fmt(curr.price)}，涨幅 ${pct.toFixed(1)}%`,
            detected_at: new Date(`${curr.snapshot_date}T09:00:00`).toISOString(),
          }
        }
      }
      if (
        !picked &&
        prev.rating != null &&
        curr.rating != null &&
        prev.rating - curr.rating >= 0.5
      ) {
        picked = {
          type: 'rating_drop',
          change_value: round2(prev.rating - curr.rating),
          description: `「${p.title}」评分从 ${prev.rating.toFixed(1)} 降至 ${curr.rating.toFixed(1)}`,
          detected_at: new Date(`${curr.snapshot_date}T09:00:00`).toISOString(),
        }
      }
    }
    if (picked) {
      anomalies.push({
        id: uuid(),
        competitor_id: competitorId,
        product_id: p.id,
        ...picked,
        is_read: false,
        product_title: p.title,
        competitor_name: competitorName,
      })
    }

    // 新品上架事件
    if (firstSeen < HISTORY_DAYS) {
      anomalies.push({
        id: uuid(),
        competitor_id: competitorId,
        product_id: p.id,
        type: 'new_product',
        description: `「${p.title}」在 ${competitorName} 新上架，定价 ${fmt(p.price)}`,
        change_value: p.price,
        detected_at: new Date(`${dateDaysAgo(firstSeen)}T09:00:00`).toISOString(),
        is_read: false,
        product_title: p.title,
        competitor_name: competitorName,
      })
    }
  }
  return { rows, anomalies }
}

/**
 * 首次访问时写入示例数据：
 * - 三条竞品，覆盖 已完成 / 失败 两种状态
 * - 已完成竞品的产品带 90 天历史快照（含跳变、新品）
 * - 产品预跑启发式 AI 评分；定价历史预置两条；异常事件自动生成
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

  // 新品队列：前四个完成态产品分别设定上架时间，制造新品事件与周分布
  const newProductQueue = [28, 12, 1, 20]
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
      firstSeenDaysAgo: newProductQueue.shift() ?? HISTORY_DAYS,
      ...p,
    }))
    store.products[id] = products
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
  const ranked = [...enriched].sort(
    (a, b) => store.analyses[b.id].total_score - store.analyses[a.id].total_score,
  )
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

  // 预置两条定价方案
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

  // 生成 90 天历史快照与异常事件
  for (const demo of demos) {
    if (demo.status !== 'completed') continue
    const competitor = store.competitors.find((c) => c.name === demo.name)
    const products = store.products[competitor.id]
    const { rows, anomalies } = buildHistory(competitor.id, demo.name, products)
    store.snapshots[competitor.id] = rows
    store.anomalies.push(...anomalies)
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
    firstSeenDaysAgo: HISTORY_DAYS,
    ...p,
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

/** 模拟一次采集：延迟后全量替换 20 条产品并铺 90 天历史快照，返回产品数量 */
export async function mockRunScrape(competitorId) {
  await delay(MOCK_SCRAPE_MIN_MS + Math.random() * MOCK_SCRAPE_EXTRA_MS)
  const store = loadStore()
  const competitor = store.competitors.find((c) => c.id === competitorId)
  if (!competitor) return 0 // 采集期间被删除，静默取消

  const scrapedAt = new Date().toISOString()
  const products = generateMockProducts(20, originOf(competitor.url)).map((p) => ({
    ...p,
    firstSeenDaysAgo: HISTORY_DAYS,
  }))
  replaceProducts(store, competitorId, products, scrapedAt)
  // 为新产品铺历史快照，保证趋势页面数据连续
  const { rows } = buildHistory(competitorId, competitor.name, products)
  store.snapshots[competitorId] = rows

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
  store.anomalies = store.anomalies.filter((a) => a.competitor_id !== id)
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

// ---------------- 快照序列（趋势监控 / 数据看板） ----------------

export async function mockSnapshotSeries(days) {
  await delay(250)
  const store = loadStore()
  const since = dateDaysAgo(days)
  const compById = new Map(store.competitors.map((c) => [c.id, c]))
  const rows = []
  for (const [competitorId, snaps] of Object.entries(store.snapshots)) {
    const competitor = compById.get(competitorId)
    if (!competitor) continue
    const titleById = new Map(
      (store.products[competitorId] ?? []).map((p) => [p.id, p.title]),
    )
    for (const s of snaps) {
      if (s.snapshot_date < since) continue
      rows.push({
        date: s.snapshot_date,
        price: s.price,
        rating: s.rating,
        review_count: s.review_count,
        competitor_id: competitorId,
        competitor_name: competitor.name,
        product_id: s.product_id,
        product_title: titleById.get(s.product_id) ?? '已下架产品',
      })
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
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

// ---------------- 异常事件 ----------------

function hasAnomalyOn(store, productId, type, dateStr) {
  return store.anomalies.some(
    (a) =>
      a.product_id === productId &&
      a.type === type &&
      String(a.detected_at).slice(0, 10) === dateStr,
  )
}

function pushAnomaly(store, anomaly) {
  store.anomalies.push({ id: uuid(), is_read: false, ...anomaly })
}

/**
 * 本地异常检测（与 detect-anomalies Edge Function 规则一致）：
 * 对比每产品最近两次快照的价格/评分，加上按竞品对比最近两次采集的新品。
 */
export async function mockDetectAnomalies(competitorId = null) {
  await delay(1500)
  const store = loadStore()
  const compById = new Map(store.competitors.map((c) => [c.id, c]))
  const today = new Date().toISOString().slice(0, 10)
  let detected = 0

  const targets = Object.entries(store.snapshots).filter(
    ([cid]) => !competitorId || cid === competitorId,
  )
  for (const [cid, snaps] of targets) {
    const competitor = compById.get(cid)
    if (!competitor) continue
    const titleById = new Map(
      (store.products[cid] ?? []).map((p) => [p.id, p.title]),
    )
    const dates = [...new Set(snaps.map((s) => s.snapshot_date))].sort()
    if (dates.length < 2) continue

    // 新品：产品仅有一次快照，且首现于近 7 天内（新品终身只报一次）
    const sevenDaysAgo = dateDaysAgo(7)
    for (const [pid, list] of byProduct) {
      if (list.length !== 1) continue
      const first = [...list].sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date),
      )[0]
      if (first.snapshot_date < sevenDaysAgo) continue
      if (store.anomalies.some((a) => a.product_id === pid && a.type === 'new_product')) continue
      const title = titleById.get(pid) ?? '已下架产品'
      pushAnomaly(store, {
        competitor_id: cid,
        product_id: pid,
        type: 'new_product',
        description: `「${title}」在 ${competitor.name} 新上架，定价 ${fmt(first.price)}`,
        change_value: first.price,
        detected_at: new Date().toISOString(),
        product_title: title,
        competitor_name: competitor.name,
      })
      detected += 1
    }

    // 价格 / 评分：每产品最近两个不同日期的快照
    const byProduct = new Map()
    for (const s of snaps) {
      if (!byProduct.has(s.product_id)) byProduct.set(s.product_id, [])
      byProduct.get(s.product_id).push(s)
    }
    for (const [pid, list] of byProduct) {
      const sorted = [...list].sort((a, b) =>
        a.snapshot_date.localeCompare(b.snapshot_date),
      )
      if (sorted.length < 2) continue
      const prev = sorted[sorted.length - 2]
      const curr = sorted[sorted.length - 1]
      const title = titleById.get(pid) ?? '已下架产品'

      if (prev.price && curr.price && prev.price !== curr.price) {
        const pct = round2(((curr.price - prev.price) / prev.price) * 100)
        if (pct <= -10 && !hasAnomalyOn(store, pid, 'price_drop', today)) {
          pushAnomaly(store, {
            competitor_id: cid,
            product_id: pid,
            type: 'price_drop',
            description: `「${title}」价格从 ${fmt(prev.price)} 降至 ${fmt(curr.price)}，降幅 ${Math.abs(pct).toFixed(1)}%`,
            change_value: pct,
            detected_at: new Date().toISOString(),
            product_title: title,
            competitor_name: competitor.name,
          })
          detected += 1
        } else if (pct >= 10 && !hasAnomalyOn(store, pid, 'price_rise', today)) {
          pushAnomaly(store, {
            competitor_id: cid,
            product_id: pid,
            type: 'price_rise',
            description: `「${title}」价格从 ${fmt(prev.price)} 涨至 ${fmt(curr.price)}，涨幅 ${pct.toFixed(1)}%`,
            change_value: pct,
            detected_at: new Date().toISOString(),
            product_title: title,
            competitor_name: competitor.name,
          })
          detected += 1
        }
      }

      if (
        prev.rating != null &&
        curr.rating != null &&
        prev.rating - curr.rating >= 0.5 &&
        !hasAnomalyOn(store, pid, 'rating_drop', today)
      ) {
        pushAnomaly(store, {
          competitor_id: cid,
          product_id: pid,
          type: 'rating_drop',
          description: `「${title}」评分从 ${prev.rating.toFixed(1)} 降至 ${curr.rating.toFixed(1)}`,
          change_value: round2(prev.rating - curr.rating),
          detected_at: new Date().toISOString(),
          product_title: title,
          competitor_name: competitor.name,
        })
        detected += 1
      }
    }
  }
  saveStore(store)
  return detected
}

export async function mockListAnomalies() {
  await delay(150)
  return [...loadStore().anomalies].sort((a, b) =>
    (b.detected_at ?? '').localeCompare(a.detected_at ?? ''),
  )
}

export async function mockMarkAnomalyRead(id) {
  const store = loadStore()
  const anomaly = store.anomalies.find((a) => a.id === id)
  if (anomaly) {
    anomaly.is_read = true
    saveStore(store)
  }
}

export async function mockIgnoreAnomaly(id) {
  const store = loadStore()
  store.anomalies = store.anomalies.filter((a) => a.id !== id)
  saveStore(store)
}
