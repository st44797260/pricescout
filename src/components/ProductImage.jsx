import { useState } from 'react'
import { Package } from 'lucide-react'
import { cn } from '../lib/format.js'

/** 产品图片：加载失败时回退为占位图标 */
export default function ProductImage({ src, alt, className }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-slate-100 text-slate-300',
          className,
        )}
        aria-label={alt}
      >
        <Package className="h-5 w-5" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded-lg bg-slate-100 object-cover', className)}
    />
  )
}
