/**
 * 定价数学库。
 * heuristicPricing 与 Edge Function suggest-pricing 内置的启发式算法
 * 保持一致（未配置 Supabase/AI Key 时由前端本地执行，输出结构相同）。
 */

export const MARKETS = [
  { value: 'us', label: '美国' },
  { value: 'eu', label: '欧洲' },
  { value: 'sea', label: '东南亚' },
  { value: 'global', label: '全球' },
]

const MARKET_ADVICE = {
  us: '美国市场客单价承受力强、重视物流时效与品牌感，可在合理区间内适当上探',
  eu: '欧洲市场需额外承担 VAT 与合规成本，定价时建议预留利润缓冲',
  sea: '东南亚市场价格敏感度高，建议贴近竞品中位数定价并严控物流成本',
  global: '全球市场建议以竞品中位数锚定，兼顾不同地区的价格承受力',
}

/** 价格分布三区间配色（图表与图例共用） */
export const ZONE_META = {
  low: { label: '低价区', color: '#F59E0B' },
  mid: { label: '合理区', color: '#10B981' },
  high: { label: '高价区', color: '#EF4444' },
}

export function round2(v) {
  return Math.round(v * 100) / 100
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))

const fmt = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `$${Number(v).toFixed(2)}`)

/** 保本价：(成本 + 物流) / (1 - 佣金比例) */
export function breakEvenPrice(cost, shipping, feePct) {
  const denom = 1 - feePct / 100
  return denom > 0.02 ? (cost + shipping) / denom : cost + shipping
}

/** 达成目标利润率所需售价：(成本 + 物流) / (1 - 佣金比例 - 利润率) */
export function targetPriceFor(cost, shipping, feePct, marginPct) {
  const denom = 1 - feePct / 100 - marginPct / 100
  return denom >= 0.05 ? (cost + shipping) / denom : null
}

/** 净利润：售价 × (1 - 佣金比例) - 成本 - 物流 */
export function netProfit(price, cost, shipping, feePct) {
  return price * (1 - feePct / 100) - cost - shipping
}

/** 实际利润率（%） */
export function marginPct(price, cost, shipping, feePct) {
  if (!price) return 0
  return (netProfit(price, cost, shipping, feePct) / price) * 100
}

function tokenize(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

/** 标题 token 重合度 > 0.3 视为同类，返回其价格列表 */
export function filterSimilarPrices(productName, products) {
  const tokens = tokenize(productName)
  if (tokens.size === 0) return []
  const prices = []
  for (const p of products) {
    const price = Number(p.price)
    if (!Number.isFinite(price) || price <= 0) continue
    const titleTokens = tokenize(p.title)
    let inter = 0
    for (const t of tokens) if (titleTokens.has(t)) inter += 1
    if (inter >= 1 && inter / tokens.size > 0.3) prices.push(price)
  }
  return prices
}

export function buildBuckets(prices, size = 10) {
  if (!prices.length) return []
  const total = Math.max(1, Math.ceil(Math.max(...prices) / size))
  const buckets = Array.from({ length: total }, (_, i) => ({
    min: i * size,
    max: (i + 1) * size,
    label: `$${i * size}-${(i + 1) * size}`,
    count: 0,
  }))
  for (const p of prices) {
    const idx = Math.min(buckets.length - 1, Math.floor(p / size))
    buckets[idx].count += 1
  }
  return buckets
}

export function computeDistribution(prices) {
  if (!prices.length) {
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

/** 推荐价的竞品百分位：价格低于推荐价的竞品占比（%） */
export function percentileOf(price, prices) {
  if (!prices.length) return 0
  const below = prices.filter((p) => p < price).length
  return Math.round((below / prices.length) * 100)
}

/** 桶属于哪个价格区间：整体低于建议下限=低价区，高于上限=高价区，其余=合理区 */
export function zoneOfBucket(bucket, low, high) {
  if (bucket.max <= low) return 'low'
  if (bucket.min >= high) return 'high'
  return 'mid'
}

/**
 * 启发式定价，输出与 AI 返回结构一致：
 * { price_low, price_recommended, price_high, strategy_text, percentile, risks, distribution, model }
 */
export function heuristicPricing(input, products) {
  const { cost, target_margin, shipping_cost, platform_fee, market = 'global' } = input

  const similar = filterSimilarPrices(input.product_name, products)
  const matched = similar.length >= 2
  const prices = matched
    ? similar
    : products
        .map((p) => Number(p.price))
        .filter((v) => Number.isFinite(v) && v > 0)
  const distribution = computeDistribution(prices)
  const sorted = [...prices].sort((a, b) => a - b)

  const be = breakEvenPrice(cost, shipping_cost, platform_fee)
  const tp =
    targetPriceFor(cost, shipping_cost, platform_fee, target_margin) ??
    (cost + shipping_cost) / 0.35
  const recommended = round2(Math.max(tp, be))
  const low = round2(Math.max(be, recommended * 0.82))
  const high = round2(recommended * 1.25)
  const percentile = prices.length ? percentileOf(recommended, prices) : null

  const risks = []
  if (prices.length >= 5) {
    const q = (p) => sorted[clamp(Math.floor(sorted.length * p), 0, sorted.length - 1)]
    const p25 = q(0.25)
    const p75 = q(0.75)
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
