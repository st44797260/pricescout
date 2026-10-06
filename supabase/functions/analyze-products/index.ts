// Supabase Edge Function: analyze-products
//
// 接收一批产品 { products: [{ id, title, price, rating, review_count,
// competitor_name?, similar_count? }] }，对每个产品做多维度 AI 评分：
//   demand      市场需求热度（0-100）：依据评价数、评分
//   competition 竞争激烈程度（0-100，分高=竞争小）：依据同类款数量与价格分布
//   profit      利润空间（0-100）：依据价格定位与品类特征
//   logistics   物流友好度（0-100）：依据标题关键词推断体积重量
//   total_score 综合推荐指数 = 0.3*demand + 0.25*competition + 0.25*profit + 0.2*logistics
//
// 模式：
//   1. 配置 AI_API_KEY（OpenAI 兼容接口，可选 AI_BASE_URL / AI_MODEL）→ 调用大模型
//   2. 未配置 → 内置启发式评分（与 src/lib/aiScoring.js 算法保持一致）
//
// 结果写入 analyses 表（同产品仅保留最新一条）并返回给前端。
// 部署：
//   supabase functions deploy analyze-products
//   supabase secrets set AI_API_KEY=sk-xxxx   （可选）
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const WEIGHTS = { demand: 0.3, competition: 0.25, profit: 0.25, logistics: 0.2 }
const MAX_BATCH = 20
const AI_TIMEOUT_MS = 60_000

const HEAVY_KEYWORDS = [
  'treadmill', 'walking pad', 'projector', 'furniture', 'desk', 'blanket',
  'bin', 'scrubber', 'pan', 'cooker', 'maker', 'diffuser', 'storage',
  'cabinet', 'mattress',
]
const LIGHT_KEYWORDS = [
  'ring', 'patch', 'roller', 'case', 'mat', 'strap', 'band', 'light',
  'lamp', 'clip', 'mount', 'cable', 'sticker', 'cushion cover',
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const clamp = (v: number, lo = 0, hi = 100) =>
  Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))

function tokenize(title: string): Set<string> {
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

/** 标题相似度（Jaccard）：> 0.45 视为近似款 */
function similarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size)
}

// ------------------------------------------------------------------
// 启发式评分（未配置 AI_API_KEY 时的兜底，与前端 src/lib/aiScoring.js 一致）
// ------------------------------------------------------------------
function weightedTotal(scores: {
  demand: number
  competition: number
  profit: number
  logistics: number
}): number {
  const total =
    scores.demand * WEIGHTS.demand +
    scores.competition * WEIGHTS.competition +
    scores.profit * WEIGHTS.profit +
    scores.logistics * WEIGHTS.logistics
  return Math.round(clamp(total))
}

function heuristicAnalyze(p: any, batch: any[]): any {
  const reviewCount = Number(p.review_count ?? 0)
  const rating = Number(p.rating ?? 0)
  const price = Number(p.price ?? 0)
  const title = String(p.title ?? '')

  // 需求热度：评价数（对数刻度）+ 评分
  const reviewPart = (Math.log10(1 + reviewCount) / Math.log10(9000)) * 65
  const ratingPart = rating ? ((rating - 3.5) / 1.5) * 35 : 14
  const demand = Math.round(clamp(reviewPart + ratingPart))

  // 竞争：近似款越多，竞争越小（分数越低）；优先使用客户端提供的全量统计
  const similarCount = Number(
    p.similar_count ??
      batch.filter(
        (o) => o.id !== p.id && similarity(o.title, title) > 0.45,
      ).length,
  )
  const competition = Math.round(clamp(85 - similarCount * 11))

  // 利润空间：价格甜点区 $20-60
  let profit: number
  if (price <= 0) profit = 40
  else if (price < 10) profit = 38
  else if (price < 20) profit = 58
  else if (price < 50) profit = 80
  else if (price < 80) profit = 70
  else profit = 55

  // 物流友好度：标题关键词推断
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
    product_id: p.id,
    scores: { ...scores, notes, model: 'heuristic' },
    total_score: total,
    reason,
  }
}

// ------------------------------------------------------------------
// 大模型评分（OpenAI 兼容接口）
// ------------------------------------------------------------------
async function aiAnalyze(products: any[], apiKey: string): Promise<any[]> {
  const baseUrl = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'

  const system =
    '你是跨境电商选品专家。对给定产品逐个做四维度评分（0-100 整数）：' +
    'demand 市场需求热度（依据评价数、评分）；competition 竞争激烈程度，分数越高代表竞争越小' +
    '（依据同类款数量与价格分布）；profit 利润空间（依据价格定位与品类）；' +
    'logistics 物流友好度（依据标题关键词推断体积重量，小件高分、大件低分）。' +
    'reason 为 50-100 字中文推荐理由；notes 为各维度 ≤20 字中文简评。' +
    '只输出 JSON：{"results":[{"product_id":"...","scores":{"demand":0,"competition":0,' +
    '"profit":0,"logistics":0,"notes":{"demand":"...","competition":"...","profit":"...","logistics":"..."}},"reason":"..."}]}'

  const user = JSON.stringify({
    batch_context: {
      selection_size: products.length,
      price_median: median(products.map((p) => Number(p.price ?? 0))),
    },
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      price: p.price,
      rating: p.rating,
      review_count: p.review_count,
      competitor_name: p.competitor_name,
      similar_count: p.similar_count,
    })),
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
  const items = Array.isArray(parsed?.results) ? parsed.results : []
  if (items.length === 0) throw new Error('AI 未返回有效结果')

  return items.map((item: any) => {
    const scores = {
      demand: Math.round(clamp(Number(item?.scores?.demand ?? 50))),
      competition: Math.round(clamp(Number(item?.scores?.competition ?? 50))),
      profit: Math.round(clamp(Number(item?.scores?.profit ?? 50))),
      logistics: Math.round(clamp(Number(item?.scores?.logistics ?? 50))),
    }
    const noteList = item?.scores?.notes ?? {}
    return {
      product_id: String(item?.product_id ?? ''),
      scores: {
        ...scores,
        notes: {
          demand: String(noteList.demand ?? '').slice(0, 40),
          competition: String(noteList.competition ?? '').slice(0, 40),
          profit: String(noteList.profit ?? '').slice(0, 40),
          logistics: String(noteList.logistics ?? '').slice(0, 40),
        },
        model,
      },
      total_score: weightedTotal(scores),
      reason: String(item?.reason ?? '').slice(0, 300),
    }
  })
}

function median(values: number[]): number {
  const nums = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nums.length === 0) return 0
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

// ------------------------------------------------------------------
// 持久化：同产品仅保留最新一条分析记录
// ------------------------------------------------------------------
async function persistAnalyses(
  admin: ReturnType<typeof createClient>,
  results: any[],
) {
  const ids = results.map((r) => r.product_id).filter(Boolean)
  if (ids.length > 0) {
    await admin.from('analyses').delete().in('product_id', ids)
  }
  const rows = results.map((r) => ({
    product_id: r.product_id,
    scores: r.scores,
    total_score: r.total_score,
    reason: r.reason,
  }))
  const { error } = await admin.from('analyses').insert(rows)
  if (error) throw new Error(`写入分析结果失败: ${error.message}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { products } = await req.json()
    if (!Array.isArray(products) || products.length === 0) {
      return json({ success: false, error: 'products 不能为空' }, 400)
    }
    const batch = products.slice(0, MAX_BATCH)
    const apiKey = Deno.env.get('AI_API_KEY')

    let results: any[]
    let model: string
    if (apiKey) {
      try {
        results = await aiAnalyze(batch, apiKey)
        model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'
      } catch (aiError) {
        // AI 调用失败时逐个回退到启发式评分，保证整批可用
        results = batch.map((p) => heuristicAnalyze(p, batch))
        model = `heuristic(fallback: ${(aiError as Error).message})`
      }
    } else {
      results = batch.map((p) => heuristicAnalyze(p, batch))
      model = 'heuristic'
    }

    // 校正 product_id 并过滤无效项
    results = results
      .map((r, i) => ({ ...r, product_id: r.product_id || batch[i]?.id }))
      .filter((r) => Boolean(r.product_id))

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await persistAnalyses(admin, results)

    return json({ success: true, model, results })
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
