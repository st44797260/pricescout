import { cn } from '../lib/format.js'

/**
 * 空状态 SVG 插画（纯 SVG 手绘，无外部图片）。
 * variant: 'box' | 'search' | 'report' | 'tag' | 'bookmark' | 'trend' | 'radar'
 */

function BoxArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#EFF6FF" />
      <path d="M36 44 60 32l24 12-24 12-24-12Z" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" fill="#fff" />
      <path d="M36 44v16l24 12V56" stroke="#CBD5E1" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M84 44v16l-24 12" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="97" cy="28" r="2.5" fill="#93C5FD" />
      <circle cx="22" cy="62" r="2" fill="#CBD5E1" />
      <circle cx="102" cy="66" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

function SearchArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="58" cy="44" r="30" fill="#F0F9FF" />
      <rect x="34" y="24" width="26" height="34" rx="4" stroke="#94A3B8" strokeWidth="2.5" fill="#fff" />
      <path d="M40 34h14M40 41h14M40 48h8" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="68" cy="44" r="14" stroke="#2563EB" strokeWidth="3" fill="#EFF6FF" />
      <path d="m78 54 9 9" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="68" cy="44" r="5" fill="#BFDBFE" />
      <circle cx="24" cy="30" r="2" fill="#93C5FD" />
      <circle cx="98" cy="24" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

function ReportArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#F0FDF4" />
      <path d="M40 20h28l12 12v36a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4Z" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" fill="#fff" />
      <path d="M68 20v12h12" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="48" y="44" width="6" height="14" rx="1.5" fill="#BFDBFE" />
      <rect x="58" y="38" width="6" height="20" rx="1.5" fill="#60A5FA" />
      <rect x="68" y="48" width="6" height="10" rx="1.5" fill="#93C5FD" />
      <path d="m50 34 6-5 5 3 7-6" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="99" cy="30" r="2" fill="#93C5FD" />
      <circle cx="20" cy="64" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

function TagArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#FFF7ED" />
      <g transform="rotate(-12 60 44)">
        <path d="M42 30h20l16 16-20 20-16-16V30Z" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" fill="#fff" />
        <circle cx="50" cy="38" r="3.5" stroke="#2563EB" strokeWidth="2.5" />
        <path d="m58 46 12 12M64 40l12 12" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <text x="86" y="26" fontSize="9" fontWeight="600" fill="#F97316" fontFamily="Inter, sans-serif">$</text>
      <circle cx="24" cy="30" r="2" fill="#FDBA74" />
      <circle cx="100" cy="62" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

function BookmarkArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#EFF6FF" />
      <path d="M46 24h28a4 4 0 0 1 4 4v40l-18-10-18 10V28a4 4 0 0 1 4-4Z" stroke="#94A3B8" strokeWidth="2.5" strokeLinejoin="round" fill="#fff" />
      <path d="M54 36h16M54 44h10" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m70 52 4 4 7-8" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="28" r="2" fill="#93C5FD" />
      <circle cx="98" cy="68" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

function TrendArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#F0F9FF" />
      <path d="M32 68h56" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 52h56M32 38h40" stroke="#EEF2F7" strokeWidth="2" strokeLinecap="round" />
      <path d="m36 58 12-10 10 6 14-16 10 4" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="82" cy="42" r="3.5" fill="#EF4444" stroke="#fff" strokeWidth="1.5" />
      <path d="m84 36 6-6M90 30h-5m5 0v5" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="34" r="2" fill="#93C5FD" />
    </svg>
  )
}

function RadarArt() {
  return (
    <svg viewBox="0 0 120 88" fill="none" className="h-full w-full">
      <circle cx="60" cy="46" r="30" fill="#ECFEFF" />
      <circle cx="60" cy="46" r="22" stroke="#94A3B8" strokeWidth="2" strokeDasharray="4 5" />
      <circle cx="60" cy="46" r="13" stroke="#CBD5E1" strokeWidth="2" />
      <circle cx="60" cy="46" r="3" fill="#06B6D4" />
      <path d="M60 46 74 32" stroke="#06B6D4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="76" cy="52" r="3" fill="#EF4444" stroke="#fff" strokeWidth="1.5" />
      <circle cx="46" cy="38" r="2.5" fill="#F59E0B" stroke="#fff" strokeWidth="1.5" />
      <circle cx="100" cy="28" r="2" fill="#67E8F9" />
      <circle cx="20" cy="62" r="1.8" fill="#E2E8F0" />
    </svg>
  )
}

const ILLUSTRATIONS = {
  box: BoxArt,
  search: SearchArt,
  report: ReportArt,
  tag: TagArt,
  bookmark: BookmarkArt,
  trend: TrendArt,
  radar: RadarArt,
}

/**
 * 空状态：SVG 插画 + 引导文案 + 操作按钮。
 * illustration 指定插画变体；未指定时回退到 icon 图标。
 */
export default function EmptyState({
  illustration,
  icon: Icon,
  title,
  description,
  children,
  className,
}) {
  const Art = illustration ? ILLUSTRATIONS[illustration] ?? ILLUSTRATIONS.box : null
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      {Art ? (
        <div className="h-[88px] w-[120px]">
          <Art />
        </div>
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          {Icon && <Icon className="h-7 w-7 text-slate-400" />}
        </div>
      )}
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}
