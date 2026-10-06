/**
 * 趋势数据聚合。
 * 输入为统一形状的快照行（api.getSnapshotSeries 归一化）：
 * { date: 'YYYY-MM-DD', price, rating, review_count,
 *   competitor_id, competitor_name, product_id, product_title }
 */

/** 每竞品 × 每日期聚合一条：{ dates, competitors: [{ id, name, values: Map<date, number>] } */
export function buildCompetitorSeries(rows, dimension) {
  const firstSeen = new Map()
  for (const r of rows) {
    const prev = firstSeen.get(r.product_id)
    if (!prev || r.date < prev) firstSeen.set(r.product_id, r.date)
  }
  // 窗口起点就存在的产品属于基线，不计入"当日新品"
  const baselineDate = [...firstSeen.values()].sort()[0] ?? null

  const byCompetitor = new Map()
  for (const r of rows) {
    if (!byCompetitor.has(r.competitor_id)) {
      byCompetitor.set(r.competitor_id, { name: r.competitor_name ?? '未知竞品', byDate: new Map() })
    }
    const comp = byCompetitor.get(r.competitor_id)
    if (!comp.byDate.has(r.date)) {
      comp.byDate.set(r.date, { sum: 0, n: 0, sumR: 0, nR: 0, sumRev: 0, nRev: 0, newCount: 0 })
    }
    const d = comp.byDate.get(r.date)
    if (dimension === 'rating') {
      if (r.rating != null) {
        d.sumR += Number(r.rating)
        d.nR += 1
      }
    } else if (dimension === 'review_count') {
      d.sumRev += Number(r.review_count) || 0
      d.nRev += 1
    } else {
      if (r.price != null) {
        d.sum += Number(r.price)
        d.n += 1
      }
    }
    if (r.date !== baselineDate && firstSeen.get(r.product_id) === r.date) d.newCount += 1
  }

  const dates = [...new Set(rows.map((r) => r.date))].sort()

  const competitors = [...byCompetitor.entries()].map(([id, comp]) => {
    const values = new Map()
    for (const [date, d] of comp.byDate) {
      let value = null
      if (dimension === 'rating') value = d.nR > 0 ? d.sumR / d.nR : null
      else if (dimension === 'review_count') value = d.nRev > 0 ? Math.round(d.sumRev / d.nRev) : null
      else if (dimension === 'new_products') value = d.newCount
      else value = d.n > 0 ? d.sum / d.n : null
      values.set(date, value)
    }
    return { id, name: comp.name, values }
  })

  return { dates, competitors }
}

/** 把每竞品序列合并成 Recharts 数据：[{ date, [竞品名]: value|null }] */
export function mergeSeries({ dates, competitors }) {
  return dates.map((date) => {
    const row = { date }
    for (const comp of competitors) {
      row[comp.name] = comp.values.get(date) ?? null
    }
    return row
  })
}

/** 全体竞品合计的平均值序列（看板价格总览 / 趋势页评分小图） */
export function overallSeries(rows, dimension) {
  const byDate = new Map()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { sum: 0, n: 0 })
    const d = byDate.get(r.date)
    const v = dimension === 'rating' ? r.rating : r.price
    if (v != null) {
      d.sum += Number(v)
      d.n += 1
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, value: d.n > 0 ? d.sum / d.n : null }))
}

/** 产品价格涨跌（每个产品最后两个不同日期的快照），按绝对幅度排序 */
export function productPriceChanges(rows) {
  const byProduct = new Map()
  for (const r of rows) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, [])
    byProduct.get(r.product_id).push(r)
  }
  const changes = []
  for (const list of byProduct.values()) {
    const dates = [...new Set(list.map((r) => r.date))].sort()
    if (dates.length < 2) continue
    const currDate = dates[dates.length - 1]
    const prevDate = dates[dates.length - 2]
    const curr = list.find((r) => r.date === currDate)
    const prev = list.find((r) => r.date === prevDate)
    if (!curr || !prev || !prev.price || !curr.price || prev.price === curr.price) continue
    changes.push({
      product_id: curr.product_id,
      product_title: curr.product_title,
      competitor_name: curr.competitor_name,
      old: Number(prev.price),
      recent: Number(curr.price),
      changePct: ((Number(curr.price) - Number(prev.price)) / Number(prev.price)) * 100,
    })
  }
  return changes.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
}

/** 新品上架按周统计（产品首次出现的快照日期归入所在周；窗口起点已存在的不算新品） */
export function weeklyNewProducts(rows, weeks = 8) {
  const firstSeen = new Map()
  for (const r of rows) {
    const prev = firstSeen.get(r.product_id)
    if (!prev || r.date < prev) firstSeen.set(r.product_id, r.date)
  }
  if (firstSeen.size === 0) return []
  const baselineDate = [...firstSeen.values()].sort()[0]
  const byWeek = new Map()
  for (const date of firstSeen.values()) {
    if (date === baselineDate) continue // 窗口起点已在监控的产品不算新品
    const week = weekStart(date)
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-weeks)
    .map(([week, count]) => ({ week, count }))
}

function weekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = (d.getDay() + 6) % 7 // 周一为一周开始
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

/** 异常事件类型元信息 */
export const ANOMALY_TYPES = {
  price_drop: { label: '降价促销', color: '#EF4444' },
  price_rise: { label: '涨价', color: '#F97316' },
  new_product: { label: '新品上架', color: '#2563EB' },
  rating_drop: { label: '口碑下滑', color: '#F59E0B' },
}

/** 变化幅度格式化：价格类为带符号百分比，评分类为分值 */
export function formatChange(type, value) {
  if (value == null) return '—'
  if (type === 'price_drop' || type === 'price_rise') {
    return `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`
  }
  if (type === 'rating_drop') return `-${Number(value).toFixed(1)} 分`
  if (type === 'new_product') return `$${Number(value).toFixed(2)}`
  return String(value)
}
