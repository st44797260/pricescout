// Supabase Edge Function: detect-anomalies
//
// 对比每个产品最近两次不同日期的快照，按规则检测异常并写入 anomalies 表：
//   price_drop   降价促销：价格较上一次快照下降超过 10%
//   price_rise   涨价：价格上升超过 10%
//   rating_drop  口碑下滑：评分下降超过 0.5
//   new_product  新品上架：本次采集出现、上一次采集不存在的产品
// 同一产品同一类型同一天只保留一条（幂等，可重复调用）。
//
// 接收 { competitor_id? }：不传则检测全部竞品。
// 部署：supabase functions deploy detect-anomalies
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const LOOKBACK_DAYS = 60

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const round2 = (v: number) => Math.round(v * 100) / 100
const fmt = (v: number) => `$${Number(v).toFixed(2)}`

interface Snap {
  product_id: string
  price: number | null
  rating: number | null
  snapshot_date: string
  product: {
    id: string
    title: string
    competitor_id: string
    competitor: { id: string; name: string } | null
  } | null
}

interface Candidate {
  competitor_id: string
  product_id: string
  type: string
  description: string
  change_value: number | null
  date_key: string // 用于幂等去重的日期（YYYY-MM-DD）
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { competitor_id } = await req.json().catch(() => ({}) as any)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000)
      .toISOString()
      .slice(0, 10)

    let query = admin
      .from('snapshots')
      .select(
        'product_id, price, rating, snapshot_date, product:products(id, title, competitor_id, competitor:competitors(id, name))',
      )
      .gte('snapshot_date', since)
      .order('snapshot_date')
    if (competitor_id) query = query.eq('product.competitor_id', competitor_id)

    const { data: snaps, error: loadError } = await query
    if (loadError) throw new Error(`读取快照失败: ${loadError.message}`)

    const rows = (snaps ?? []) as unknown as Snap[]
    // 产品已被重新采集替换的快照（join 为空）直接跳过
    const valid = rows.filter((r) => r.product && r.product.competitor)

    // 按产品分组，取最后两个不同日期的快照
    const byProduct = new Map<string, Snap[]>()
    for (const r of valid) {
      if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, [])
      byProduct.get(r.product_id)!.push(r)
    }

    const candidates: Candidate[] = []

    // 规则 1-3：价格 / 评分对比
    for (const [productId, list] of byProduct) {
      const dates = [...new Set(list.map((s) => s.snapshot_date))].sort()
      if (dates.length < 2) continue
      const currDate = dates[dates.length - 1]
      const prevDate = dates[dates.length - 2]
      const curr = list.filter((s) => s.snapshot_date === currDate)[0]
      const prev = list.filter((s) => s.snapshot_date === prevDate)[0]
      const meta = curr.product!
      const base = {
        competitor_id: meta.competitor_id,
        product_id: productId,
        date_key: currDate,
      }

      if (
        prev.price != null && curr.price != null &&
        prev.price > 0 && Number(curr.price) !== Number(prev.price)
      ) {
        const pct = round2(
          ((Number(curr.price) - Number(prev.price)) / Number(prev.price)) * 100,
        )
        if (pct <= -10) {
          candidates.push({
            ...base,
            type: 'price_drop',
            change_value: pct,
            description: `「${meta.title}」价格从 ${fmt(prev.price)} 降至 ${fmt(curr.price)}，降幅 ${Math.abs(pct)}%`,
          })
        } else if (pct >= 10) {
          candidates.push({
            ...base,
            type: 'price_rise',
            change_value: pct,
            description: `「${meta.title}」价格从 ${fmt(prev.price)} 涨至 ${fmt(curr.price)}，涨幅 ${pct}%`,
          })
        }
      }

      if (
        prev.rating != null && curr.rating != null &&
        Number(prev.rating) - Number(curr.rating) >= 0.5
      ) {
        const drop = round2(Number(prev.rating) - Number(curr.rating))
        candidates.push({
          ...base,
          type: 'rating_drop',
          change_value: drop,
          description: `「${meta.title}」评分从 ${Number(prev.rating).toFixed(1)} 降至 ${Number(curr.rating).toFixed(1)}`,
        })
      }
    }

    // 规则 4：新品上架——产品仅有一次快照，且首现于近 7 天内
    // （不按竞品日期差集判断，避免个别产品快照稀疏时产生大量误报）
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000)
      .toISOString()
      .slice(0, 10)
    for (const [productId, list] of byProduct) {
      if (list.length !== 1) continue
      const first = list[0]
      const meta = first.product
      if (!meta) continue
      if (first.snapshot_date < sevenDaysAgo) continue
      candidates.push({
        competitor_id: meta.competitor_id,
        product_id: productId,
        type: 'new_product',
        change_value: first.price != null ? round2(Number(first.price)) : null,
        date_key: '',
        description: `「${meta.title}」在 ${meta.competitor?.name ?? '未知竞品'} 新上架${first.price != null ? `，定价 ${fmt(first.price)}` : ''}`,
      })
    }

    // 幂等去重：同产品同类型同日已存在则跳过；新品事件终身只报一次
    const { data: existing } = await admin
      .from('anomalies')
      .select('product_id, type, detected_at')
    const seen = new Set(
      (existing ?? []).map((r: any) =>
        `${r.product_id}|${r.type}|${r.type === 'new_product' ? '' : String(r.detected_at).slice(0, 10)}`,
      ),
    )
    const toInsert = candidates.filter((c) => {
      const key = `${c.product_id}|${c.type}|${c.type === 'new_product' ? '' : c.date_key}`
      return !seen.has(key)
    })

    if (toInsert.length > 0) {
      const { error: insertError } = await admin.from('anomalies').insert(
        toInsert.map((c) => ({
          competitor_id: c.competitor_id,
          product_id: c.product_id,
          type: c.type,
          description: c.description,
          change_value: c.change_value,
          detected_at: new Date().toISOString(),
          is_read: false,
        })),
      )
      if (insertError) throw new Error(`写入异常事件失败: ${insertError.message}`)
    }

    return json({ success: true, detected: toInsert.length })
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
