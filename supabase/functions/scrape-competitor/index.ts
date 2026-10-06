// Supabase Edge Function: scrape-competitor
//
// 接收 { competitor_id }，按平台抓取竞品站点产品数据并写入数据库：
//   1. shopify      → /products.json 公开接口
//   2. woocommerce  → /wp-json/wc/store/v1/products 公开接口
//   3. custom       → Firecrawl 抓取首页与产品列表页，解析 JSON-LD 结构化数据
//   4. mock         → 未配置 FIRECRAWL_API_KEY 时，返回 20 条与真实抓取
//                     结构一致的模拟数据，方便本地联调
//
// 部署：
//   supabase functions deploy scrape-competitor
//   supabase secrets set FIRECRAWL_API_KEY=fc-xxxx   （可选，缺省走 mock 模式）
import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as cheerio from 'npm:cheerio@1.0.0'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 20_000
const FIRECRAWL_TIMEOUT_MS = 45_000
const MAX_PRODUCTS = 100

interface RawProduct {
  title: string
  price: number | null
  rating: number | null
  review_count: number
  image_url: string | null
  product_url: string | null
}

interface Competitor {
  id: string
  name: string
  url: string
  platform: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function normalizeOrigin(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return new URL(withScheme).origin
}

function absUrl(path: string | null | undefined, base: string): string | null {
  if (!path || typeof path !== 'string') return null
  try {
    return new URL(path, base).toString()
  } catch {
    return null
  }
}

// ------------------------------------------------------------------
// mock 模式：生成 20 条与真实抓取结构完全一致的模拟产品
// ------------------------------------------------------------------
const MOCK_NAMES = [
  'Insulated Stainless Steel Water Bottle',
  'Wireless Noise-Cancelling Earbuds',
  'Memory Foam Contour Pillow',
  'LED Strip Lights with Remote',
  'Portable USB Mini Blender',
  'Aluminum Ergonomic Laptop Stand',
  'Mulberry Silk Pillowcase',
  'Resistance Bands Set (5-Pack)',
  '1080p Mini Projector',
  'Rechargeable Heated Eyelash Curler',
  'Cordless Electric Spin Scrubber',
  'Sunset Projection Lamp',
  'Magnetic Wireless Power Bank',
  'Hydrocolloid Acne Patches (36 ct)',
  'Dog Chew Rope Toys (5-Pack)',
  'High-Waist Yoga Leggings',
  'Cold Brew Coffee Maker',
  'Non-Stick Silicone Baking Mats',
  'Smart Sleep Tracking Ring',
  'Chunky Knit Throw Blanket',
  'Magnetic Car Vent Phone Mount',
  'UV Resin Jewelry Kit',
  'Adjustable Posture Corrector',
  'Facial Ice Roller',
  'Under-Desk Walking Pad',
  'Collapsible Storage Bins (3-Pack)',
  'Ceramic Nonstick Frying Pan',
  'Aromatherapy Essential Oil Diffuser',
]

const MOCK_MODIFIERS = [
  'Pro',
  '2026 New',
  'Premium',
  'Classic',
  'Upgraded',
  'Travel Size',
  'Pack of 2',
  '- Black',
  '- White',
  '- 16oz',
]

function generateMockProducts(count = 20, origin?: string): RawProduct[] {
  const used = new Set<string>()
  const products: RawProduct[] = []
  let i = 0
  while (products.length < count && i < count * 5) {
    i++
    const name =
      MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)]
    const modifier =
      MOCK_MODIFIERS[Math.floor(Math.random() * MOCK_MODIFIERS.length)]
    const title = Math.random() > 0.4 ? `${name} ${modifier}` : name
    if (used.has(title)) continue
    used.add(title)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    products.push({
      title,
      price: Number((4.99 + Math.random() * 75).toFixed(2)),
      rating: Number((3.6 + Math.random() * 1.4).toFixed(1)),
      review_count: Math.floor(Math.random() * 5200),
      image_url: `https://picsum.photos/seed/${slug}-${i}/400/400`,
      product_url: origin ? `${origin}/products/${slug}` : null,
    })
  }
  return products
}

// ------------------------------------------------------------------
// 平台抓取实现
// ------------------------------------------------------------------
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${url}`)
  return res.json()
}

async function scrapeShopify(origin: string): Promise<RawProduct[]> {
  const data = await fetchJson(`${origin}/products.json?limit=100`)
  const items = Array.isArray(data?.products) ? data.products : []
  if (items.length === 0) throw new Error('products.json 未返回产品数据')
  return items.map((p: any) => ({
    title: String(p.title ?? '未命名产品'),
    price: p.variants?.[0]?.price != null ? Number(p.variants[0].price) : null,
    rating: null,
    review_count: 0,
    image_url: absUrl(p.featured_image ?? p.images?.[0]?.src, origin),
    product_url: p.handle ? `${origin}/products/${p.handle}` : null,
  }))
}

async function scrapeWooCommerce(origin: string): Promise<RawProduct[]> {
  const items = await fetchJson(
    `${origin}/wp-json/wc/store/v1/products?per_page=100`,
  )
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('WooCommerce Store API 未返回产品数据')
  }
  return items.map((p: any) => {
    const minor = Number(p.prices?.currency_minor_unit ?? 2) || 2
    return {
      title: String(p.name ?? '未命名产品'),
      price: p.prices?.price != null ? Number(p.prices.price) / 10 ** minor : null,
      rating: p.average_rating != null ? Number(p.average_rating) : null,
      review_count: Number(p.review_count ?? 0),
      image_url: p.images?.[0]?.src ?? null,
      product_url: p.permalink ?? null,
    }
  })
}

async function firecrawlScrapeHtml(url: string): Promise<string> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) throw new Error('未配置 FIRECRAWL_API_KEY')
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['html'] }),
    signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Firecrawl 请求失败 (${res.status})`)
  const data = await res.json()
  const html = data?.data?.html ?? data?.data?.rawHtml ?? ''
  if (!html) throw new Error('Firecrawl 未返回页面内容')
  return html
}

function walkLdNodes(node: any, out: any[]) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((child) => walkLdNodes(child, out))
    return
  }
  out.push(node)
  if (node['@graph']) walkLdNodes(node['@graph'], out)
}

function firstImage(image: any, base: string): string | null {
  if (typeof image === 'string') return absUrl(image, base)
  if (Array.isArray(image)) {
    for (const item of image) {
      const url = typeof item === 'string' ? item : item?.url
      const abs = absUrl(url, base)
      if (abs) return abs
    }
  }
  return null
}

function extractFromHtml(html: string, baseOrigin: string): RawProduct[] {
  const $ = cheerio.load(html)
  const products: RawProduct[] = []
  const seen = new Set<string>()

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const nodes: any[] = []
      walkLdNodes(JSON.parse($(el).contents().text() || '{}'), nodes)
      for (const node of nodes) {
        const types = Array.isArray(node['@type'])
          ? node['@type']
          : [node['@type']]
        if (!types.some((t) => String(t).toLowerCase() === 'product')) continue
        const title = typeof node.name === 'string' ? node.name : null
        if (!title) continue
        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
        const priceRaw = offers?.price ?? offers?.lowPrice ?? null
        const ratingNode = node.aggregateRating
        const product: RawProduct = {
          title,
          price: priceRaw != null && !Number.isNaN(Number(priceRaw))
            ? Number(priceRaw)
            : null,
          rating: ratingNode?.ratingValue != null
            ? Number(ratingNode.ratingValue)
            : null,
          review_count: ratingNode?.reviewCount
            ? Number(ratingNode.reviewCount)
            : 0,
          image_url: firstImage(node.image, baseOrigin),
          product_url: absUrl(node.url, baseOrigin),
        }
        const key = product.product_url ?? product.title
        if (seen.has(key)) continue
        seen.add(key)
        products.push(product)
      }
    } catch {
      // 无效的 ld+json 片段直接忽略
    }
  })

  // JSON-LD 拿不到足够产品时，回退到启发式链接提取
  if (products.length < 5) {
    $('a[href]').each((_, el) => {
      if (products.length >= MAX_PRODUCTS) return false
      const href = $(el).attr('href')
      if (!href || !/\/products?\/[^/?#]+/i.test(href)) return
      const productUrl = absUrl(href, baseOrigin)
      if (!productUrl || seen.has(productUrl)) return
      seen.add(productUrl)
      const title =
        ($(el).find('img').attr('alt') || $(el).text() || '').trim()
      if (!title) return
      products.push({
        title: title.slice(0, 300),
        price: null,
        rating: null,
        review_count: 0,
        image_url: absUrl($(el).find('img').attr('src'), baseOrigin),
        product_url: productUrl,
      })
    })
  }
  return products
}

async function scrapeCustom(origin: string): Promise<RawProduct[]> {
  // 首页 + 常见产品列表页，直到拿够产品
  const candidates = [origin, `${origin}/products`, `${origin}/collections/all`]
  let all: RawProduct[] = []
  for (const url of candidates) {
    try {
      const html = await firecrawlScrapeHtml(url)
      all = extractFromHtml(html, origin)
      if (all.length >= 5) break
    } catch {
      // 单个页面失败继续尝试下一个候选地址
    }
  }
  if (all.length === 0) throw new Error('未能从站点提取到产品数据')
  return all.slice(0, MAX_PRODUCTS)
}

async function scrapeCompetitor(
  competitor: Competitor,
): Promise<{ products: RawProduct[]; mock: boolean }> {
  const origin = normalizeOrigin(competitor.url)
  const hasKey = Boolean(Deno.env.get('FIRECRAWL_API_KEY'))

  if (!hasKey) {
    return { products: generateMockProducts(20, origin), mock: true }
  }
  if (competitor.platform === 'shopify') {
    return { products: await scrapeShopify(origin), mock: false }
  }
  if (competitor.platform === 'woocommerce') {
    return { products: await scrapeWooCommerce(origin), mock: false }
  }
  return { products: await scrapeCustom(origin), mock: false }
}

// ------------------------------------------------------------------
// 持久化：替换产品 + 写快照 + 更新竞品状态
// ------------------------------------------------------------------
async function persist(
  admin: ReturnType<typeof createClient>,
  competitor: Competitor,
  products: RawProduct[],
): Promise<number> {
  const rows = products.slice(0, MAX_PRODUCTS).map((p) => ({
    competitor_id: competitor.id,
    title: p.title,
    price: p.price,
    rating: p.rating,
    review_count: p.review_count ?? 0,
    image_url: p.image_url,
    product_url: p.product_url,
    scraped_at: new Date().toISOString(),
  }))

  // 重新采集为全量替换；旧产品删除时快照随外键级联删除
  const { error: delError } = await admin
    .from('products')
    .delete()
    .eq('competitor_id', competitor.id)
  if (delError) throw new Error(`清理旧产品失败: ${delError.message}`)

  const { data: inserted, error: insertError } = await admin
    .from('products')
    .insert(rows)
    .select('id, price, rating, review_count')
  if (insertError) throw new Error(`写入产品失败: ${insertError.message}`)

  if (inserted && inserted.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    const { error: snapError } = await admin.from('snapshots').insert(
      inserted.map((p: any) => ({
        product_id: p.id,
        price: p.price,
        rating: p.rating,
        review_count: p.review_count,
        snapshot_date: today,
      })),
    )
    if (snapError) throw new Error(`写入快照失败: ${snapError.message}`)
  }

  const { error: updateError } = await admin
    .from('competitors')
    .update({
      product_count: inserted?.length ?? 0,
      last_scraped_at: new Date().toISOString(),
      status: 'completed',
    })
    .eq('id', competitor.id)
  if (updateError) throw new Error(`更新竞品状态失败: ${updateError.message}`)

  return inserted?.length ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { competitor_id } = await req.json()
    if (!competitor_id) return json({ success: false, error: '缺少 competitor_id' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: competitor, error: loadError } = await admin
      .from('competitors')
      .select('id, name, url, platform')
      .eq('id', competitor_id)
      .single()
    if (loadError || !competitor) {
      return json({ success: false, error: '竞品不存在' }, 404)
    }

    await admin.from('competitors').update({ status: 'scraping' }).eq('id', competitor_id)

    try {
      const { products, mock } = await scrapeCompetitor(competitor as Competitor)
      const count = await persist(admin, competitor as Competitor, products)
      return json({ success: true, product_count: count, mock })
    } catch (scrapeError) {
      await admin.from('competitors').update({ status: 'failed' }).eq('id', competitor_id)
      return json(
        { success: false, error: String((scrapeError as Error)?.message ?? scrapeError) },
        500,
      )
    }
  } catch (err) {
    return json({ success: false, error: String(err) }, 500)
  }
})
