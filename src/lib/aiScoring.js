/**
 * AI 选品评分前端工具。
 *
 * heuristicScore 与 Edge Function analyze-products 内置的启发式算法
 * 保持一致（未配置 Supabase/AI Key 时由前端本地执行，输出结构相同）；
 * 同时提供分数配色、维度元信息等展示工具。
 */

export const WEIGHTS = { demand: 0.3, competition: 0.25, profit: 0.25, logistics: 0.2 }

/** 四个评分维度的展示元信息 */
export const DIMENSIONS = [
  { key: 'demand', label: '市场需求热度', short: '需求' },
  { key: 'competition', label: '竞争激烈程度', short: '竞争', hint: '分数越高，竞争越小' },
  { key: 'profit', label: '利润空间', short: '利润' },
  { key: 'logistics', label: '物流友好度', short: '物流' },
]

/** 推荐指数分档：80+ 绿 / 60+ 蓝 / 40+ 橙 / 其余红 */
const TONES = {
  green: {
    label: '强烈推荐',
    ring: '#10B981',
    text: 'text-emerald-600',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50',
  },
  blue: {
    label: '推荐',
    ring: '#2563EB',
    text: 'text-blue-600',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
    bar: 'bg-blue-500',
    soft: 'bg-blue-50',
  },
  orange: {
    label: '观望',
    ring: '#F97316',
    text: 'text-orange-600',
    chip: 'bg-orange-50 text-orange-700 ring-orange-200',
    bar: 'bg-orange-500',
    soft: 'bg-orange-50',
  },
  red: {
    label: '不推荐',
    ring: '#EF4444',
    text: 'text-red-600',
    chip: 'bg-red-50 text-red-700 ring-red-200',
    bar: 'bg-red-500',
    soft: 'bg-red-50',
  },
}

export function scoreTone(score) {
  const v = Number(score)
  if (!Number.isFinite(v)) return TONES.blue
  if (v >= 80) return TONES.green
  if (v >= 60) return TONES.blue
  if (v >= 40) return TONES.orange
  return TONES.red
}

const HEAVY_KEYWORDS = [
  'treadmill', 'walking pad', 'projector', 'furniture', 'desk', 'blanket',
  'bin', 'scrubber', 'pan', 'cooker', 'maker', 'diffuser', 'storage',
  'cabinet', 'mattress',
]
const LIGHT_KEYWORDS = [
  'ring', 'patch', 'roller', 'case', 'mat', 'strap', 'band', 'light',
  'lamp', 'clip', 'mount', 'cable', 'sticker', 'cushion cover',
]

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))
}

function tokenize(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

/** 标题相似度（Jaccard），> 0.45 视为近似款 */
export function titleSimilarity(a, b) {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return inter / Math.min(ta.size, tb.size)
}

/** 统计每个产品在同批次中的近似款数量（作为竞争维度的上下文） */
export function enrichSimilarCounts(products) {
  return products.map((p) => ({
    ...p,
    similar_count: products.filter(
      (o) => o.id !== p.id && titleSimilarity(o.title, p.title) > 0.45,
    ).length,
  }))
}

export function weightedTotal(scores) {
  return Math.round(
    clamp(
      scores.demand * WEIGHTS.demand +
        scores.competition * WEIGHTS.competition +
        scores.profit * WEIGHTS.profit +
        scores.logistics * WEIGHTS.logistics,
    ),
  )
}

/**
 * 启发式评分：输出与 AI 返回结构一致
 * { product_id, scores: {demand, competition, profit, logistics, notes, model}, total_score, reason }
 */
export function heuristicScore(product, batch = []) {
  const reviewCount = Number(product.review_count ?? 0)
  const rating = Number(product.rating ?? 0)
  const price = Number(product.price ?? 0)
  const title = String(product.title ?? '')

  const reviewPart = (Math.log10(1 + reviewCount) / Math.log10(9000)) * 65
  const ratingPart = rating ? ((rating - 3.5) / 1.5) * 35 : 14
  const demand = Math.round(clamp(reviewPart + ratingPart))

  const similarCount = Number(
    product.similar_count ??
      batch.filter((o) => o.id !== product.id && titleSimilarity(o.title, title) > 0.45)
        .length,
  )
  const competition = Math.round(clamp(85 - similarCount * 11))

  let profit
  if (price <= 0) profit = 40
  else if (price < 10) profit = 38
  else if (price < 20) profit = 58
  else if (price < 50) profit = 80
  else if (price < 80) profit = 70
  else profit = 55

  const lower = title.toLowerCase()
  const heavy = HEAVY_KEYWORDS.some((k) => lower.includes(k))
  const light = LIGHT_KEYWORDS.some((k) => lower.includes(k))
  const logistics = heavy ? 35 : light ? 85 : 65

  const scores = { demand, competition, profit, logistics }
  const total = weightedTotal(scores)

  const profitNote =
    price <= 0
      ? '价格缺失，无法评估'
      : price < 20
        ? `定价 $${price.toFixed(2)}，毛利偏薄`
        : price < 50
          ? `定价 $${price.toFixed(2)}，处于利润甜点区`
          : `定价 $${price.toFixed(2)}，客单价偏高`

  const notes = {
    demand: `评价 ${reviewCount.toLocaleString('en-US')} 条，评分 ${rating || '—'}`,
    competition:
      similarCount > 0 ? `同批次发现 ${similarCount} 个近似款` : '近似款较少，赛道宽松',
    profit: profitNote,
    logistics: heavy
      ? '标题含大件关键词，头程成本高'
      : light
        ? '小件商品，物流友好'
        : '常规体积，物流适中',
  }

  const stance =
    total >= 80
      ? '强烈建议重点跟进'
      : total >= 60
        ? '值得小批量测试上架'
        : total >= 40
          ? '建议继续观察'
          : '暂不推荐投入'

  const reason =
    `「${title}」需求热度 ${demand} 分（评价 ${reviewCount.toLocaleString('en-US')} 条），` +
    `同批近似款 ${similarCount} 个、竞争${similarCount > 2 ? '较激烈' : '可控'}；` +
    `定价 $${price ? price.toFixed(2) : '—'}，利润空间${profit >= 70 ? '较充足' : '一般'}；` +
    `${heavy ? '属大件商品，物流成本偏高' : '物流友好度尚可'}。综合来看，${stance}。`

  return {
    product_id: product.id,
    scores: { ...scores, notes, model: 'heuristic' },
    total_score: total,
    reason,
  }
}
