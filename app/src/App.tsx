import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Home, RotateCcw, TrendingUp, BookOpen, Menu, Settings, Flame } from 'lucide-react'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'
import { useApp } from './state'
import { CURRICULUM, TOTAL_DAYS, getLesson } from './data/curriculum'
import { dueCards } from './lib/srs'
import { isDayComplete, displayStreak } from './lib/storage'
import { PHASE_INFO } from './blocks'
import { Logo, LogoMark } from './components/ui/brand'
import { AuthControls, TutorFab } from './components/ai'
import type { LessonCtx } from './lib/ai'
import { cn } from './lib/utils'

function useNav() {
  const { state } = useApp()
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const due = dueCards(state.cards).length
  return { current, due, streak: displayStreak(state) }
}

// Scroll to top on route change so users never land mid-page.
function useScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
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
      <div className="px-3 py-3.5">
        <Logo />
      </div>

      <div className="px-3 pt-3">
        <div className="label-nd mb-1 px-2">页面</div>
        <nav className="flex flex-col gap-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-8 items-center gap-2 rounded-md px-2 text-body transition-colors duration-150',
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
                      <span className="absolute left-0 top-1/2 h-4 -translate-y-1/2 rounded-r-full bg-red" style={{ width: 3 }} />
                    )}
                    <Icon size={16} strokeWidth={1.9} className={isActive ? 'text-fg' : 'text-fg-muted'} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? (
                      <span className="rounded-full bg-accent-soft px-1.5 text-label font-medium text-brand">
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
        <div className="label-nd mb-1.5 px-2">阶段</div>
        <div className="flex flex-col gap-0.5">
          {Object.entries(PHASE_INFO).map(([k, v]) => {
            const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((d) => d.day)
            const done = days.filter((d) => isDayComplete(state, d)).length
            return (
              <div key={k} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} />
                <span className="flex-1 truncate text-fg-secondary">{v.name_zh}</span>
                <span className="text-label text-fg-muted">{done}/{days.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-auto p-3">
        <AuthControls onNavigate={onNavigate} />
        <div className="my-2 border-t border-border" />
        <div className="mb-1 flex items-center gap-1.5 px-2 text-meta text-fg-secondary">
          <Flame size={13} className="text-red" /> <span className="t-num">{streak}</span> 天连续
        </div>
        <NavLink
          to="/progress"
          onClick={onNavigate}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
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
  useScrollTop()

  // Lesson context for the AI tutor — reflect the day being viewed, else today.
  const dayMatch = loc.pathname.match(/^\/day\/(\d+)/)
  const ctxLesson = getLesson(dayMatch ? Number(dayMatch[1]) : current)
  const lessonCtx: LessonCtx = ctxLesson
    ? {
        day: ctxLesson.day,
        theme: ctxLesson.theme,
        title_en: ctxLesson.title_en,
        grammar: ctxLesson.grammarNote?.point_en,
        level: 'A2-B1',
      }
    : {}

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-border bg-surface-2 md:block">
        <SidebarContent />
      </aside>

      {/* Mobile top header */}
      <header className="pt-safe sticky top-0 z-30 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between border-b border-border bg-bg/85 px-3 backdrop-blur-md md:hidden">
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
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">30 DAYS</span>
        </div>
        <NavLink
          to="/review"
          aria-label={due > 0 ? `词卡复习，${due} 张待复习` : '词卡复习'}
          className="grid h-11 min-w-11 place-items-center rounded-md text-fg-secondary hover:bg-hover"
        >
          <span className="relative" aria-hidden>
            <RotateCcw size={19} />
            {due > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-accent-soft px-1 text-label font-medium text-brand">
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
                  'flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-label transition-colors duration-150',
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

      {/* Floating AI tutor (only renders when AI is configured + signed in) */}
      <TutorFab lesson={lessonCtx} />
    </div>
  )
}
