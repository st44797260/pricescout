import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  Menu,
  PackageSearch,
  Radar,
  Search,
  Settings,
  Store,
  Tag,
  TrendingUp,
  User,
  X,
} from 'lucide-react'
import ScrapeStatusBar from '../components/ScrapeStatusBar.jsx'
import AssistantChat from '../components/AssistantChat.jsx'

const NAV_ITEMS = [
  { to: '/', label: '数据看板', icon: LayoutDashboard, end: true },
  { to: '/competitors', label: '竞品管理', icon: Store },
  { to: '/products', label: '选品分析', icon: PackageSearch },
  { to: '/pricing', label: '定价助手', icon: Tag },
  { to: '/trends', label: '趋势监控', icon: TrendingUp },
  { to: '/reports', label: '报告中心', icon: FileText },
]

const SECONDARY_ITEMS = [
  { label: '设置', icon: Settings },
  { label: '帮助', icon: HelpCircle },
]

function NavItem({ to, label, icon: Icon, end = false, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex h-10 cursor-pointer items-center gap-3 px-4 text-sm transition-colors ${
          isActive
            ? 'bg-blue-50 font-medium text-primary'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* 选中项左侧蓝色竖条指示器，切换时平滑滑动 */}
          {isActive && (
            <motion.span
              layoutId="sidebar-active-bar"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              className="absolute left-0 top-1/2 -mt-3 h-6 w-1 rounded-r-full bg-primary"
            />
          )}
          <Icon
            className={`h-[18px] w-[18px] shrink-0 ${
              isActive ? 'text-primary' : 'text-slate-400'
            }`}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function Brand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
        <Radar className="h-5 w-5 text-cyan-500" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-ink">PriceScout</span>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const closeMobileNav = () => setMobileNavOpen(false)

  const current = NAV_ITEMS.find(
    (item) =>
      item.to === location.pathname ||
      (item.to !== '/' && location.pathname.startsWith(item.to)),
  )
  const currentLabel = current?.label ?? '数据看板'
  // 子页面（竞品详情 / 选品清单 / 定价历史 / 报告详情）在面包屑中追加一层
  const extraCrumb = /^\/competitors\/[^/]+/.test(location.pathname)
    ? '竞品详情'
    : location.pathname === '/products/shortlist'
      ? '选品清单'
      : location.pathname === '/pricing/history'
        ? '定价历史'
        : /^\/reports\/[^/]+/.test(location.pathname)
          ? '报告详情'
          : null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page print:block print:h-auto print:overflow-visible lg:flex-row">
      {/* ============ 移动端顶栏（汉堡菜单） ============ */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
          aria-label="打开导航菜单"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
            <Radar className="h-4.5 w-4.5 text-cyan-500" />
          </div>
          <span className="text-base font-semibold tracking-tight text-ink">PriceScout</span>
        </div>
      </header>

      {/* ============ 桌面左侧固定侧边栏（240px） ============ */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
        <Brand />

        {/* 主导航 */}
        <nav className="flex-1 overflow-y-auto py-3" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* 底部：设置 / 帮助 */}
        <div className="shrink-0 border-t border-slate-200 py-3">
          {SECONDARY_ITEMS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className="flex h-10 w-full cursor-pointer items-center gap-3 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* ============ 移动端抽屉导航 ============ */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
              onClick={closeMobileNav}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="fixed left-0 top-0 z-50 flex h-full w-60 flex-col border-r border-slate-200 bg-white lg:hidden"
              aria-label="导航菜单"
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                    <Radar className="h-5 w-5 text-cyan-500" />
                  </div>
                  <span className="text-lg font-semibold tracking-tight text-ink">PriceScout</span>
                </div>
                <button
                  type="button"
                  onClick={closeMobileNav}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="关闭菜单"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto py-3" onClick={closeMobileNav}>
                {NAV_ITEMS.map((item) => (
                  <NavItem key={item.to} {...item} onNavigate={closeMobileNav} />
                ))}
              </nav>

              <div className="shrink-0 border-t border-slate-200 py-3">
                {SECONDARY_ITEMS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    className="flex h-10 w-full cursor-pointer items-center gap-3 px-4 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0 text-slate-400" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ============ 右侧主内容区 ============ */}
      <div className="relative flex min-w-0 flex-1 flex-col print:block">
        {/* 数据采集状态提示条（悬浮于内容区顶部） */}
        <ScrapeStatusBar />

        {/* 顶栏：面包屑 + 搜索框 + 用户头像（桌面） */}
        <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 lg:flex print:hidden">
          {/* 面包屑 */}
          <nav aria-label="面包屑" className="flex shrink-0 items-center gap-1.5 text-sm">
            <Home className="h-4 w-4 text-slate-400" />
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className={extraCrumb ? 'text-ink-muted' : 'font-medium text-ink'}>
              {currentLabel}
            </span>
            {extraCrumb && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                <span className="font-medium text-ink">{extraCrumb}</span>
              </>
            )}
          </nav>

          {/* 搜索框 */}
          <div className="flex min-w-0 flex-1 justify-center px-2">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="搜索竞品、商品、关键词…"
                className="input h-9 w-full pl-9"
              />
            </div>
          </div>

          {/* 用户头像 */}
          <button
            type="button"
            title="账号中心"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm transition-shadow hover:shadow-md"
          >
            <User className="h-4 w-4" />
          </button>
        </header>

        {/* 页面内容：独立滚动 */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 print:h-auto print:overflow-visible print:p-0"
        >
          <Outlet />
        </motion.main>

        {/* AI 助手（右下角悬浮） */}
        <AssistantChat />
      </div>
    </div>
  )
}
