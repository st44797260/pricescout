// Supabase Edge Function: chat
//
// AI 助手对话接口（流式输出）：
//   1. 保存用户消息到 chat_logs
//   2. 读取该会话最近的历史消息作为上下文
//   3. 配置 AI_API_KEY → 调用大模型（stream: true），把增量文本逐块转发给前端
//      未配置 → 本地规则回复，逐字输出（与前端 mock 表现一致）
//   4. 回复完成后保存 assistant 消息
//
// 前端用 fetch + ReadableStream 读取（Content-Type: text/plain，逐块追加）。
// 部署：supabase functions deploy chat
//       supabase secrets set AI_API_KEY=sk-xxxx   （可选）
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const AI_TIMEOUT_MS = 60_000

const SYSTEM_PROMPT =
  '你是PriceScout的AI助手，一个跨境电商选品和定价分析平台。你可以帮助用户：' +
  '1）理解选品评分维度的含义；2）解释定价建议的逻辑；3）推荐适合的竞品监控策略；' +
  '4）解答跨境电商运营问题。回答要专业、简洁，必要时用数据支撑观点。'

const HISTORY_LIMIT = 12

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** 无 AI Key 时的本地规则回复（与前端 src/lib/chat.js 保持一致） */
function localAssistantReply(message: string): string {
  const m = String(message).toLowerCase()
  if (/评分|维度|打分|推荐指数|ai评分/.test(m)) {
    return (
      'PriceScout 的选品评分包含四个维度，按权重加权成 0-100 的综合推荐指数：\n\n' +
      '1. 市场需求热度（30%）：主要看评价数（对数刻度）与评分，评价越多、评分越高，需求信号越强；\n' +
      '2. 竞争激烈程度（25%）：分数越高代表竞争越小，依据同类款数量与价格分布判断；\n' +
      '3. 利润空间（25%）：$20-60 是常见甜点区，过低毛利薄、过高转化难；\n' +
      '4. 物流友好度（20%）：从标题关键词推断体积重量，小件高分、大件低分。\n\n' +
      '80 分以上强烈建议跟进，60-79 建议小批量测试，40-59 观望，40 以下暂不投入。'
    )
  }
  if (/定价|价格|利润|毛利|售价/.test(m)) {
    return (
      '定价建议的逻辑分三步：\n\n' +
      '1. 保本价 =（产品成本 + 物流成本）÷（1 - 平台佣金比例），低于它必亏；\n' +
      '2. 目标价 =（成本 + 物流）÷（1 - 佣金 - 目标利润率），这是达成利润率的最低售价；\n' +
      '3. 结合竞品分布校准：推荐价高于 75 分位竞品 15% 以上会提示溢价风险，低于 25 分位则提示低价内卷风险。\n\n' +
      '建议在三档建议价区间内定价：最低价用于冲量场景，推荐价用于日常销售，最高价配合促销活动。'
    )
  }
  if (/竞品|监控|采集|对手/.test(m)) {
    return (
      '竞品监控建议这样配置：\n\n' +
      '1. 数量上先监控 3-5 个最强直接竞品，跑通流程后再扩展到 10 个；\n' +
      '2. 平台类型尽量选 Shopify（/products.json 数据最全）或 WooCommerce（Store API 公开）；\n' +
      '3. 每周重新采集一次即可捕捉价格波动，大促期间（黑五、Prime Day）提高到每天一次；\n' +
      '4. 把趋势监控里「降价促销」提醒当作优先信号——那通常意味着对手在清库存或打价格战。'
    )
  }
  if (/趋势|异常|降价|涨价/.test(m)) {
    return (
      '异常检测目前覆盖四类事件：\n\n' +
      '· 降价促销：价格较上次快照下降超 10%，常见于清库存或跟价；\n' +
      '· 涨价：上涨超 10%，可能是断货前提价或换包装；\n' +
      '· 口碑下滑：评分下降 ≥0.5 分，值得研究对手的差评；\n' +
      '· 新品上架：竞品新出现的产品，是最直接的市场信号。\n\n' +
      '在趋势监控页点击「运行异常检测」即可扫描最近两次快照。'
    )
  }
  if (/运营|跨境|物流|广告|亚马逊|fba/.test(m)) {
    return (
      '跨境电商运营的几个通用建议：\n\n' +
      '1. 选品先看物流友好度——小件、高毛利、非易碎品更适合起步；\n' +
      '2. 定价时把退货率和广告成本（ACOS）预留 10-15% 进利润测算；\n' +
      '3. 关注竞品评价数的增速而不仅是绝对值，它反映需求趋势；\n' +
      '4. 新品期用低价 + 广告拉权重，稳定后逐步回到目标利润率。'
    )
  }
  return (
    '我是 PriceScout 助手，可以帮你：\n\n' +
    '1. 解释选品评分四个维度的含义与权重；\n' +
    '2. 拆解定价建议的公式与风险提示逻辑；\n' +
    '3. 给出竞品监控与采集节奏的策略建议；\n' +
    '4. 解答跨境电商运营的常见问题。\n\n' +
    '直接问我即可，例如「评分是怎么算的？」「怎么定价比较合理？」'
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { session_id, message } = await req.json()
    if (!session_id || !String(message ?? '').trim()) {
      return json({ success: false, error: '缺少 session_id 或消息内容' }, 400)
    }
    const text = String(message).slice(0, 2000)
    const sessionId = String(session_id).slice(0, 64)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await admin.from('chat_logs').insert({ session_id: sessionId, role: 'user', content: text })

    // 会话上下文：最近 HISTORY_LIMIT 条
    const { data: historyRows } = await admin
      .from('chat_logs')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    const history = (historyRows ?? [])
      .slice(-HISTORY_LIMIT)
      .map((r: any) => ({ role: r.role, content: r.content }))

    const apiKey = Deno.env.get('AI_API_KEY')
    const baseUrl = Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1'
    const model = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let full = ''
        const send = (chunk: string) => {
          full += chunk
          controller.enqueue(encoder.encode(chunk))
        }
        try {
          if (apiKey) {
            const res = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                stream: true,
                temperature: 0.6,
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  ...history,
                ],
              }),
              signal: AbortSignal.timeout(AI_TIMEOUT_MS),
            })
            if (!res.ok || !res.body) throw new Error(`AI 接口请求失败 (${res.status})`)

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.slice(5).trim()
                if (payload === '[DONE]') continue
                try {
                  const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
                  if (delta) send(delta)
                } catch {
                  // 忽略无法解析的 SSE 片段
                }
              }
            }
          } else {
            // 本地兜底：逐字输出，模拟打字机效果
            const reply = localAssistantReply(text)
            for (const ch of reply) {
              send(ch)
              await sleep(16)
            }
          }
        } catch (err) {
          send(`\n\n[助手暂时不可用：${String((err as Error)?.message ?? err)}]`)
        }
        if (full.trim()) {
          try {
            await admin
              .from('chat_logs')
              .insert({ session_id: sessionId, role: 'assistant', content: full })
          } catch {
            // 对话记录写入失败不影响回复流
          }
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})
