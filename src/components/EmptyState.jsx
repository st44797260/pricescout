import { PackageOpen } from 'lucide-react'

/** 空状态占位 */
export default function EmptyState({ icon: Icon = PackageOpen, title, description, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
        <Icon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}
