const DIRECTION = { asc: 1, desc: -1 }

/**
 * 表格排序 hook：同一列在升序/降序间切换，切换新列默认升序。
 * 返回 [sort, toggleSort]，sort = { key, dir }。
 */
import { useState } from 'react'

export function useSort(defaultKey, defaultDir = 'asc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )

  return [sort, toggleSort]
}

/** 比较器：数值按大小，其余按字符串；null/undefined 恒排最后 */
export function compareBy(key, dir) {
  const sign = DIRECTION[dir] ?? 1
  return (a, b) => {
    const va = a?.[key]
    const vb = b?.[key]
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * sign
    }
    return String(va).localeCompare(String(vb), 'zh-CN') * sign
  }
}
