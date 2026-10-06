// Supabase Edge Function: generate-report
//
// 汇总选品评分、定价建议与趋势数据，调用 AI 生成执行摘要，
// 结构化写入 reports 表并返回完整报告。
//
// 接收 { title, competitor_ids?, top_n?, include_pricing?, include_trends? }
// 部署：supabase functions deploy generate-report
//       supabase secrets set AI_API_KEY=sk-xxxx   （可选，缺省用模板摘要）
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const AI_TIMEOUT_MS = 60_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const round2 = (v: number) => Math.round(v * 100) / 100
const fmt = (v: unknown) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)

const ANOMALY_LABELS: Record<string, string> = {
  price_drop: '降价促销',
  price_rise: '涨价',
  new_product: '新品上架',
  rating_drop: '口碑下滑',
}

function heuristicSummary(data: any): string {
  const { competitors, topProducts, avgScore, priceChange, anomalyCounts, pricing, topN } = data
  const competitorText = `${competitors.length} 个竞品、${topProducts.length ? '覆盖其在售产品' : '暂无在售产品'}`
  const best = topProducts[0]
  const anomalyText = Object.entries(anomalyCounts)
    .map(([t, n]) => `${ANOMALY_LABELS[t] ?? t} ${n} 条`)
    .join('、')
  const trendText = priceChange == null
    ? '价格趋势数据不足'
    : `近 30 天竞品平均售价${priceChange > 0 ? '上行' : priceChange < 0 ? '下行' : '持平'}约 ${Math.abs(priceChange).toFixed(1)}%`
  const pricingText = pricing.length
    ? `已有 ${pricing.length} 条定价方案，推荐价区间 ${fmt(pricing[pricing.length - 1]?.suggested_price_low)}–${fmt(pricing[0]?.suggested_price_high)}`
    : '暂无保存的定价方案，建议为候选产品补做利润测算'

  return (
    `本报告基于 ${competitorText} 的监控数据，按 AI 综合推荐指数（市场需求 30%、竞争程度 25%、利润空间 25%、物流友好度 20% 加权）` +
    `筛选出 TOP ${topN} 推荐产品，平均指数 ${avgScore} 分${best ? `，其中「${best.title}」以 ${best.total_score} 分居首` : ''}。` +
    `趋势方面，${trendText}；近 30 天共检测到异常事件 ${Object.values(anomalyCounts).reduce((s: number, n: any) => s + Number(n), 0)} 条${anomalyText ? `（${anomalyText}）` : ''}。` +
    `定价方面，${pricingText}。综合来看，建议优先跟进高分产品并核实其实际利润空间，对降价频繁的品类保持观望。`
  )
}

async function aiSummary(data: any, apiKey: string): Promise<string> {
  const baseUrl = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'

  const system =
    '你是跨境电商分析师。根据给定数据撰写 150-250 字的中文执行摘要，' +
    '需涵盖：整体竞争格局、TOP 产品亮点（点名 1-2 个产品与其分数）、价格走势与异常事件、定价建议要点，以及一句结论建议。' +
    '只输出摘要纯文本，不要标题与列表符号。'

  const user = JSON.stringify({
    competitors: data.competitors,
    top_products: data.topProducts.slice(0, 5).map((p: any) => ({
      title: p.title,
      competitor: p.competitor_name,
      price: p.price,
      rating: p.rating,
      review_count: p.review_count,
      total_score: p.total_score,
    })),
    price_change_pct: data.priceChange,
    anomaly_counts: data.anomalyCounts,
    pricing: data.pricing.slice(0, 2).map((p: any) => ({
      product_name: p.product_name,
      recommended: p.suggested_price_recommended,
      margin: p.target_margin,
    })),
    top_n: data.topN,
  })

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`AI 接口请求失败 (${res.status})`)
  const payload = await res.json()
  const text = String(payload?.choices?.[0]?.message?.content ?? '').trim()
  if (!text) throw new Error('AI 未返回摘要')
  return text.slice(0, 600)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json()
    const config = {
      title: String(body.title ?? '选品分析报告').slice(0, 120),
      competitor_ids: Array.isArray(body.competitor_ids) ? body.competitor_ids : [],
      top_n: [10, 20, 50].includes(Number(body.top_n)) ? Number(body.top_n) : 10,
      include_pricing: body.include_pricing !== false,
      include_trends: body.include_trends !== false,
    }
    if (!config.title) return json({ success: false, error: '请填写报告标题' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. 竞品
    let compQuery = admin.from('competitors').select('id, name, platform, product_count')
    if (config.competitor_ids.length > 0) {
      compQuery = compQuery.in('id', config.competitor_ids)
    }
    const { data: competitors, error: compError } = await compQuery
    if (compError) throw new Error(`读取竞品失败: ${compError.message}`)
    const compIds = (competitors ?? []).map((c: any) => c.id)

    // 2. 产品 + AI 评分
    let ranked: any[] = []
    if (compIds.length > 0) {
      const { data: products, error: prodError } = await admin
        .from('products')
        .select('id, title, price, rating, review_count, competitor:competitors(name)')
        .in('competitor_id', compIds)
      if (prodError) throw new Error(`读取产品失败: ${prodError.message}`)

      const { data: analyses } = await admin
        .from('analyses')
        .select('product_id, total_score, reason')
      const scoreMap = new Map((analyses ?? []).map((a: any) => [a.product_id, a]))

      ranked = (products ?? [])
        .map((p: any) => {
          const analysis = scoreMap.get(p.id)
          return {
            id: p.id,
            title: p.title,
            competitor_name: p.competitor?.name ?? null,
            price: p.price,
            rating: p.rating,
            review_count: p.review_count,
            total_score: analysis ? Number(analysis.total_score) : null,
            reason: analysis?.reason ?? null,
          }
        })
        .sort((a: any, b: any) => (b.total_score ?? -1) - (a.total_score ?? -1))
        .slice(0, config.top_n)
    }

    const scored = ranked.filter((p: any) => p.total_score != null)
    const avgScore = scored.length
      ? round2(scored.reduce((s: number, p: any) => s + p.total_score, 0) / scored.length)
      : null

    // 3. 定价建议
    let pricing: any[] = []
    if (config.include_pricing) {
      const { data } = await admin
        .from('pricing_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)
      pricing = data ?? []
    }

    // 4. 趋势（近 30 天平均售价序列 + 异常计数）
    let series: any[] = []
    let priceChange: number | null = null
    let anomalyCounts: Record<string, number> = {}
    if (config.include_trends) {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
      const { data: snaps } = await admin
        .from('snapshots')
        .select('snapshot_date, price, product:products(competitor_id)')
        .gte('snapshot_date', since)
      const byDate = new Map<string, { sum: number; n: number }>()
      for (const s of snaps ?? []) {
        const compId = (s as any).product?.competitor_id
        if (compIds.length > 0 && !compIds.includes(compId)) continue
        const price = Number(s.price)
        if (!Number.isFinite(price) || price <= 0) continue
        if (!byDate.has(s.snapshot_date)) byDate.set(s.snapshot_date, { sum: 0, n: 0 })
        const d = byDate.get(s.snapshot_date)!
        d.sum += price
        d.n += 1
      }
      series = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({ date, value: round2(d.sum / d.n) }))
      if (series.length >= 2) {
        const start = series[0].value
        const end = series[series.length - 1].value
        priceChange = start > 0 ? round2(((end - start) / start) * 100) : null
      }

      let anomalyQuery = admin
        .from('anomalies')
        .select('type, detected_at')
        .gte('detected_at', `${since}T00:00:00`)
      if (config.competitor_ids.length > 0) {
        anomalyQuery = anomalyQuery.in('competitor_id', config.competitor_ids)
      }
      const { data: anomalies } = await anomalyQuery
      for (const a of anomalies ?? []) {
        anomalyCounts[a.type] = (anomalyCounts[a.type] ?? 0) + 1
      }
    }

    // 5. 执行摘要（AI 或模板）
    const aggregate = {
      competitors,
      topProducts: ranked,
      avgScore,
      priceChange,
      anomalyCounts,
      pricing,
      topN: config.top_n,
    }
    const apiKey = Deno.env.get('AI_API_KEY')
    let summary: string
    let model: string
    if (apiKey) {
      try {
        summary = await aiSummary(aggregate, apiKey)
        model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'
      } catch (aiError) {
        summary = heuristicSummary(aggregate)
        model = `heuristic(fallback: ${(aiError as Error).message})`
      }
    } else {
      summary = heuristicSummary(aggregate)
      model = 'heuristic'
    }

    // 6. 落库
    const content = {
      config,
      competitors: competitors ?? [],
      top_products: ranked.map((p: any) => ({ ...p, reason: p.reason?.slice(0, 200) ?? null })),
      pricing,
      trends: {
        window_days: 30,
        series,
        change_pct: priceChange,
        anomaly_counts: anomalyCounts,
      },
      model,
    }
    const { data: report, error: insertError } = await admin
      .from('reports')
      .insert({ title: config.title, summary, content })
      .select()
      .single()
    if (insertError) throw new Error(`保存报告失败: ${insertError.message}`)

    return json({ success: true, report, model })
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
