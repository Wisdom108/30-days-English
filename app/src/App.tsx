import { useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Home, RotateCcw, TrendingUp, BookOpen, Menu, Settings, Flame } from 'lucide-react'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'
import { useApp } from './state'
import { CURRICULUM, TOTAL_DAYS } from './data/curriculum'
import { dueCards } from './lib/srs'
import { isDayComplete } from './lib/storage'
import { PHASE_INFO } from './blocks'
import { cn } from './lib/utils'

function useNav() {
  const { state } = useApp()
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const due = dueCards(state.cards).length
  return { current, due, streak: state.streak }
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { current, due, streak } = useNav()
  const { state } = useApp()

  const items = [
    { to: '/', end: true, icon: Home, label: '首页' },
    { to: `/day/${current}`, icon: BookOpen, label: `今日 · Day ${current}` },
    { to: '/review', icon: RotateCcw, label: '词卡复习', badge: due },
    { to: '/progress', icon: TrendingUp, label: '学习进度' },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Workspace row */}
      <div className="flex items-center gap-2.5 px-3 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-hover text-[15px]">🚀</span>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold text-fg">30 天英语</div>
          <div className="text-[11px] text-fg-muted">听说侧重 · 离线可用</div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="mb-1 px-2 text-[11px] font-semibold tracking-[0.06em] text-fg-muted">页面</div>
        <nav className="flex flex-col gap-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-8 items-center gap-2 rounded-[6px] px-2 text-[14px] transition-colors duration-150',
                  isActive
                    ? 'bg-hover font-medium text-fg'
                    : 'text-fg-secondary hover:bg-hover hover:text-fg',
                )
              }
            >
              {({ isActive }) => {
                const Icon = it.icon
                return (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-r-full bg-brand" style={{ width: 3 }} />
                    )}
                    <Icon size={16} strokeWidth={1.9} className={isActive ? 'text-fg' : 'text-fg-muted'} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? (
                      <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-brand">
                        {it.badge}
                      </span>
                    ) : null}
                  </>
                )
              }}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mx-3 my-3 border-t border-border" />

      <div className="px-3">
        <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.06em] text-fg-muted">阶段</div>
        <div className="flex flex-col gap-0.5">
          {Object.entries(PHASE_INFO).map(([k, v]) => {
            const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((d) => d.day)
            const done = days.filter((d) => isDayComplete(state, d)).length
            return (
              <div key={k} className="flex items-center gap-2 rounded-[6px] px-2 py-1 text-[13px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} />
                <span className="flex-1 truncate text-fg-secondary">{v.name_zh}</span>
                <span className="text-[11px] text-fg-muted">{done}/{days.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-auto p-3">
        <div className="mb-1 flex items-center gap-1.5 px-2 text-[12px] text-fg-secondary">
          <Flame size={13} className="text-warning" /> {streak} 天连续
        </div>
        <NavLink
          to="/progress"
          onClick={onNavigate}
          className="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Settings size={14} /> 设置 · 备份
        </NavLink>
      </div>
    </div>
  )
}

const TAB_ITEMS = [
  { to: '/', end: true, icon: <Home size={19} />, label: '首页' },
  { to: 'today', icon: <BookOpen size={19} />, label: '今日' },
  { to: '/review', icon: <RotateCcw size={19} />, label: '复习' },
  { to: '/progress', icon: <TrendingUp size={19} />, label: '进度' },
]

export default function App() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { current, due } = useNav()
  const loc = useLocation()
  const onDayRoute = loc.pathname.startsWith('/day/')

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-border bg-surface-2 md:block">
        <SidebarContent />
      </aside>

      {/* Mobile top header */}
      <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-border bg-bg/85 px-3 backdrop-blur-md md:hidden">
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger asChild>
            <button className="grid h-11 w-11 place-items-center rounded-md text-fg-secondary hover:bg-hover" aria-label="菜单">
              <Menu size={20} />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] data-[state=open]:animate-in-up md:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-border bg-surface-2 shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up md:hidden">
              <Dialog.Title className="sr-only">导航菜单</Dialog.Title>
              <SidebarContent onNavigate={() => setSheetOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="flex items-center gap-1.5 text-[14px] font-semibold">
          <span>🚀</span> 30 天英语
        </div>
        <NavLink
          to="/review"
          className="grid h-11 min-w-11 place-items-center rounded-md text-fg-secondary hover:bg-hover"
        >
          <span className="relative">
            <RotateCcw size={19} />
            {due > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-accent-soft px-1 text-[10px] font-medium text-brand">
                {due}
              </span>
            )}
          </span>
        </NavLink>
      </header>

      {/* Main */}
      <main className="md:pl-[248px]">
        <div className="mx-auto max-w-[1080px] px-4 pb-24 pt-4 md:px-10 md:pb-16 md:pt-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/day/:day" element={<DayView />} />
            <Route path="/review" element={<Review />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </div>
      </main>

      {/* Mobile bottom tab bar (hidden on study routes) */}
      {!onDayRoute && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-bg/90 px-4 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden">
          {TAB_ITEMS.map((t) => (
            <NavLink
              key={t.label}
              to={t.to === 'today' ? `/day/${current}` : t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] transition-colors duration-150',
                  isActive ? 'text-brand' : 'text-fg-muted',
                )
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
