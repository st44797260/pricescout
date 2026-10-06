import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  mockAddCompetitor,
  mockDeleteCompetitor,
  mockGetCompetitor,
  mockListCompetitors,
  mockListProducts,
  mockMarkScraping,
  mockRunScrape,
} from './mockBackend.js'
import {
  SCRAPE_EVENTS,
  decActiveScrapes,
  emitScrapeEvent,
  incActiveScrapes,
} from './scrapeEvents.js'

export { SCRAPE_EVENTS, getActiveScrapeCount, onScrapeEvent } from './scrapeEvents.js'

export const PLATFORM_OPTIONS = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'custom', label: '自定义' },
]

/**
 * 触发一次采集（新竞品或重新采集）。
 * 立即返回并发布 START 事件；完成/失败时发布对应事件，
 * 页面订阅事件刷新数据，状态条据此计数。
 */
function triggerScrape(competitorId) {
  incActiveScrapes()
  emitScrapeEvent(SCRAPE_EVENTS.START, { competitorId })

  const finish = (type, payload) => {
    decActiveScrapes()
    emitScrapeEvent(type, { competitorId, ...payload })
  }

  const run = async () => {
    if (!isSupabaseConfigured) {
      return { product_count: await mockRunScrape(competitorId), mock: true }
    }
    const { data, error } = await supabase.functions.invoke('scrape-competitor', {
      body: { competitor_id: competitorId },
    })
    if (error) throw new Error(error.message)
    if (data?.success === false) throw new Error(data.error ?? '采集失败')
    return { product_count: data?.product_count ?? 0, mock: Boolean(data?.mock) }
  }

  run()
    .then(({ product_count }) =>
      finish(SCRAPE_EVENTS.COMPLETE, { productCount: product_count }),
    )
    .catch((err) =>
      finish(SCRAPE_EVENTS.ERROR, {
        message: err?.message ?? '未知错误',
      }),
    )
}

/** 规范化用户输入的站点地址：缺省补 https:// */
export function normalizeSiteUrl(input) {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export async function listCompetitors() {
  if (!isSupabaseConfigured) return mockListCompetitors()
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getCompetitor(id) {
  if (!isSupabaseConfigured) return mockGetCompetitor(id)
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

/** 新增竞品并立即在后台触发采集 */
export async function addCompetitor({ name, url, platform }) {
  const siteUrl = normalizeSiteUrl(url)
  let row
  if (!isSupabaseConfigured) {
    row = await mockAddCompetitor({ name, url: siteUrl, platform })
  } else {
    const { data, error } = await supabase
      .from('competitors')
      .insert({ name, url: siteUrl, platform, status: 'scraping' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    row = data
  }
  triggerScrape(row.id)
  return row
}

/** 重新采集：乐观地把状态置为采集中，再触发采集 */
export async function rescrapeCompetitor(id) {
  if (isSupabaseConfigured) {
    await supabase
      .from('competitors')
      .update({ status: 'scraping' })
      .eq('id', id)
  } else {
    await mockMarkScraping(id)
  }
  triggerScrape(id)
}

export async function deleteCompetitor(id) {
  if (!isSupabaseConfigured) return mockDeleteCompetitor(id)
  // products / snapshots 随外键 on delete cascade 一并删除
  const { error } = await supabase.from('competitors').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listProducts(competitorId) {
  if (!isSupabaseConfigured) return mockListProducts(competitorId)
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('competitor_id', competitorId)
    .order('scraped_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}
