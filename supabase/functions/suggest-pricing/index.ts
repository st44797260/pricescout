// Supabase Edge Function: suggest-pricing
//
// 接收定价输入 { product_name, cost, target_margin, shipping_cost,
// platform_fee, market }，流程：
//   1. 从 products 表按标题相似度筛出同类产品的价格分布
//      （相似款不足 3 个时回退到全量竞品价格）
//   2. 配置 AI_API_KEY → 调用大模型（OpenAI 兼容接口）给出：
//      建议售价区间 / 策略说明 / 风险提示；百分位在服务端按分布精确计算
//   3. 未配置 AI_API_KEY → 内置启发式定价（与 src/lib/pricing.js 算法一致）
//
// 本函数只计算不落库；保存方案由前端在用户点击「保存定价方案」时
// 写入 pricing_suggestions 表。
//
// 部署：supabase functions deploy suggest-pricing
//       supabase secrets set AI_API_KEY=sk-xxxx   （可选）
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const AI_TIMEOUT_MS = 60_000
const MARKETS = new Set(['us', 'eu', 'sea', 'global'])

const MARKET_ADVICE: Record<string, string> = {
  us: '美国市场客单价承受力强、重视物流时效与品牌感，可在合理区间内适当上探',
  eu: '欧洲市场需额外承担 VAT 与合规成本，定价时建议预留利润缓冲',
  sea: '东南亚市场价格敏感度高，建议贴近竞品中位数定价并严控物流成本',
  global: '全球市场建议以竞品中位数锚定，兼顾不同地区的价格承受力',
}

interface PricingInput {
  product_name: string
  cost: number
  target_margin: number
  shipping_cost: number
  platform_fee: number
  market: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))

function tokenize(title: string): Set<string> {
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

/** 标题 token 重合度：命中产品名 token 数 / 产品名 token 数 > 0.3 视为同类 */
function filterSimilarPrices(productName: string, rows: any[]): number[] {
  const tokens = tokenize(productName)
  if (tokens.size === 0) return []
  const prices: number[] = []
  for (const row of rows) {
    const price = Number(row.price)
    if (!Number.isFinite(price) || price <= 0) continue
    const titleTokens = tokenize(row.title)
    let inter = 0
    for (const t of tokens) if (titleTokens.has(t)) inter++
    if (inter >= 1 && inter / tokens.size > 0.3) prices.push(price)
  }
  return prices
}

function buildBuckets(prices: number[], size = 10) {
  if (prices.length === 0) return []
  const total = Math.max(1, Math.ceil(Math.max(...prices) / size))
  const buckets = Array.from({ length: total }, (_, i) => ({
    min: i * size,
    max: (i + 1) * size,
    label: `$${i * size}-${(i + 1) * size}`,
    count: 0,
  }))
  for (const p of prices) {
    const idx = Math.min(buckets.length - 1, Math.floor(p / size))
    buckets[idx].count++
  }
  return buckets
}

function computeDistribution(prices: number[]) {
  if (prices.length === 0) {
    return { count: 0, min: null, max: null, median: null, avg: null, buckets: [] }
  }
  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return {
    count: prices.length,
    min: round2(sorted[0]),
    max: round2(sorted[sorted.length - 1]),
    median: round2(median),
    avg: round2(prices.reduce((s, v) => s + v, 0) / prices.length),
    buckets: buildBuckets(prices),
  }
}

function percentileOf(price: number, prices: number[]): number {
  if (prices.length === 0) return 0
  const below = prices.filter((p) => p < price).length
  return Math.round((below / prices.length) * 100)
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = clamp(Math.floor(sorted.length * q), 0, sorted.length - 1)
  return sorted[idx]
}

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : `$${Number(v).toFixed(2)}`

function breakEvenPrice(cost: number, shipping: number, feePct: number) {
  const denom = 1 - feePct / 100
  return denom > 0.02 ? (cost + shipping) / denom : cost + shipping
}

function targetPriceFor(
  cost: number,
  shipping: number,
  feePct: number,
  marginPct: number,
) {
  const denom = 1 - feePct / 100 - marginPct / 100
  return denom >= 0.05 ? (cost + shipping) / denom : null
}

// ------------------------------------------------------------------
// 启发式定价（与前端 src/lib/pricing.js 保持一致）
// ------------------------------------------------------------------
function heuristicPricing(
  input: PricingInput,
  prices: number[],
  matched: boolean,
) {
  const { cost, target_margin, shipping_cost, platform_fee, market } = input
  const distribution = computeDistribution(prices)
  const sorted = [...prices].sort((a, b) => a - b)

  const be = breakEvenPrice(cost, shipping_cost, platform_fee)
  const tp = targetPriceFor(cost, shipping_cost, platform_fee, target_margin) ??
    (cost + shipping_cost) / 0.35
  const recommended = round2(Math.max(tp, be))
  const low = round2(Math.max(be, recommended * 0.82))
  const high = round2(recommended * 1.25)
  const percentile = prices.length ? percentileOf(recommended, prices) : null

  const risks: string[] = []
  if (prices.length >= 5) {
    const p25 = quantile(sorted, 0.25)
    const p75 = quantile(sorted, 0.75)
    if (recommended > p75 * 1.15) {
      risks.push(
        `建议价高于约 ${percentile}% 的同类竞品，需依靠差异化卖点或品牌感支撑溢价`,
      )
    }
    if (recommended < p25 * 0.9) {
      risks.push('建议价处于低价区间，利润空间有限，注意避免低价内卷')
    }
  }
  if (distribution.median != null && be > distribution.median) {
    risks.push('保本价已高于竞品中位价，成本结构偏弱，建议优化采购或物流成本')
  }
  if (target_margin + platform_fee >= 65) {
    risks.push('目标利润率与平台佣金合计过高，价格腾挪空间非常有限')
  }

  const distText = matched
    ? `与「${input.product_name}」相似的在售产品共 ${distribution.count} 个，价格集中在 ${fmt(distribution.min)}–${fmt(distribution.max)}，中位数 ${fmt(distribution.median)}`
    : `暂未找到强相关的同类产品，以下基于全量 ${distribution.count} 个竞品的价格分布（中位数 ${fmt(distribution.median)}）`

  const riskTail = risks.length
    ? `；需重点关注：${risks[0]}`
    : '，未发现明显定价风险'

  const strategy_text =
    `基于当前成本结构（产品成本 ${fmt(cost)}、物流 ${fmt(shipping_cost)}、平台佣金 ${platform_fee}%），` +
    `你的保本价为 ${fmt(be)}；要实现 ${target_margin}% 的目标利润率，售价至少需要 ${fmt(tp)}。` +
    `竞品端：${distText}。${MARKET_ADVICE[market] ?? MARKET_ADVICE.global}。` +
    `综合成本与市场，建议将售价锚定在 ${fmt(low)}–${fmt(high)} 区间，主力推荐 ${fmt(recommended)}` +
    `${percentile != null ? `，该价格约高于 ${percentile}% 的竞品` : ''}${riskTail}。`

  return {
    price_low: low,
    price_recommended: recommended,
    price_high: high,
    strategy_text,
    percentile,
    risks,
    distribution: { ...distribution, matched, market },
    model: 'heuristic',
  }
}

// ------------------------------------------------------------------
// 大模型定价（OpenAI 兼容接口）
// ------------------------------------------------------------------
async function aiPricing(
  input: PricingInput,
  prices: number[],
  matched: boolean,
  apiKey: string,
): Promise<any> {
  const baseUrl = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'
  const distribution = computeDistribution(prices)

  const system =
    '你是跨境电商定价顾问。根据成本结构、竞品价格分布与目标市场给出定价建议。规则：' +
    'price_low ≤ price_recommended ≤ price_high，且都必须高于保本价 (产品成本+物流成本)/(1-佣金比例)；' +
    'strategy_text 为 150-250 字中文，解释定价逻辑并结合竞品分布给出定位判断；' +
    'percentile 为建议价高于百分之多少的竞品（0-100 整数）；' +
    'risks 为 0-3 条中文风险提示（定价过高/过低/竞争/成本等，每条不超过 40 字）。' +
    '只输出 JSON：{"price_low":0,"price_recommended":0,"price_high":0,' +
    '"strategy_text":"...","risks":["..."]}'

  const user = JSON.stringify({
    input,
    competitor_distribution: { ...distribution, matched },
    market_note: MARKET_ADVICE[input.market] ?? MARKET_ADVICE.global,
  })

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`AI 接口请求失败 (${res.status})`)

  const data = await res.json()
  let content = String(data?.choices?.[0]?.message?.content ?? '')
  content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(content)

  const be = breakEvenPrice(input.cost, input.shipping_cost, input.platform_fee)
  const low = round2(clamp(Number(parsed.price_low), be, Number.MAX_SAFE_INTEGER))
  const recommended = round2(
    clamp(Number(parsed.price_recommended), low, Number.MAX_SAFE_INTEGER),
  )
  const high = round2(
    clamp(Number(parsed.price_high), recommended, Number.MAX_SAFE_INTEGER),
  )
  if (![low, recommended, high].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error('AI 返回的价格无效')
  }

  return {
    price_low: low,
    price_recommended: recommended,
    price_high: high,
    strategy_text: String(parsed.strategy_text ?? '').slice(0, 800),
    percentile: prices.length ? percentileOf(recommended, prices) : null,
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.slice(0, 3).map((r: any) => String(r).slice(0, 60))
      : [],
    distribution: { ...distribution, matched, market: input.market },
    model,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const input: PricingInput = {
      product_name: String(body.product_name ?? '').slice(0, 200),
      cost: Number(body.cost),
      target_margin: clamp(Number(body.target_margin), 1, 95),
      shipping_cost: Math.max(0, Number(body.shipping_cost) || 0),
      platform_fee: clamp(Number(body.platform_fee) || 0, 0, 40),
      market: MARKETS.has(body.market) ? body.market : 'global',
    }
    if (!input.product_name) return json({ success: false, error: '请填写产品名称' }, 400)
    if (!Number.isFinite(input.cost) || input.cost <= 0) {
      return json({ success: false, error: '产品成本必须大于 0' }, 400)
    }

    // 从 products 表取价格并按标题相似度筛选同类产品
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: rows, error: loadError } = await admin
      .from('products')
      .select('title, price')
      .not('price', 'is', null)
    if (loadError) throw new Error(`读取竞品价格失败: ${loadError.message}`)

    const similar = filterSimilarPrices(input.product_name, rows ?? [])
    const matched = similar.length >= 2
    const prices = matched ? similar : (rows ?? []).map((r: any) => Number(r.price)).filter((v: number) => Number.isFinite(v) && v > 0)

    const apiKey = Deno.env.get('AI_API_KEY')
    let suggestion: any
    let model: string
    if (apiKey && prices.length > 0) {
      try {
        suggestion = await aiPricing(input, prices, matched, apiKey)
        model = suggestion.model
      } catch (aiError) {
        suggestion = heuristicPricing(input, prices, matched)
        model = `heuristic(fallback: ${(aiError as Error).message})`
      }
    } else {
      suggestion = heuristicPricing(input, prices, matched)
      model = 'heuristic'
    }

    return json({ success: true, model, suggestion })
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
