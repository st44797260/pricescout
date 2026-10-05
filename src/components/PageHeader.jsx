/**
 * 页面标题占位组件 —— 后续步骤中各页面会在此之下填充内容
 */
export default function PageHeader({ title, description }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      )}
    </div>
  )
}
