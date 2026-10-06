import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '../lib/format.js'

/** 表头排序指示器：激活列显示箭头方向，未激活显示双向箭头 */
export default function SortIcon({ active, dir, className }) {
  if (!active) {
    return <ArrowUpDown className={cn('h-3 w-3 text-slate-300', className)} />
  }
  return dir === 'asc' ? (
    <ArrowUp className={cn('h-3 w-3 text-blue-600', className)} />
  ) : (
    <ArrowDown className={cn('h-3 w-3 text-blue-600', className)} />
  )
}

/** 可排序表头按钮（放在 th 内使用） */
export function SortHeader({ label, column, sort, onToggle, className }) {
  const active = sort.key === column
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        'group inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-slate-800',
        active && 'text-slate-800',
        className,
      )}
    >
      {label}
      <SortIcon active={active} dir={sort.dir} />
    </button>
  )
}
