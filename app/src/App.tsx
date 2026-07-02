import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, RotateCcw, TrendingUp, BookOpen, Search, Crosshair, Flame, Settings,
} from 'lucide-react'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'
import { useApp } from './state'
import { TOTAL_DAYS, getLesson } from './data/curriculum'
import { dueCards } from './lib/srs'
import { displayStreak } from './lib/storage'
import { LogoMark } from './components/ui/brand'
import { IconButton } from './components/ui'
import { AuthControls, TutorFab } from './components/ai'
import { CommandPalette } from './components/CommandPalette'
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

const NAV = [
  { to: '/', end: true, icon: Home, label: 'HOME' },
  { to: 'today', icon: BookOpen, label: 'TODAY' },
  { to: '/review', icon: RotateCcw, label: 'REVIEW', badge: true },
  { to: '/progress', icon: TrendingUp, label: 'PROGRESS' },
]

export default function App() {
  const { current, due, streak } = useNav()
  const nav = useNavigate()
  const loc = useLocation()
  const onDayRoute = loc.pathname.startsWith('/day/')
  useScrollTop()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [focus, setFocus] = useState(false)

  const toggleMotion = () => {
    const off = document.body.classList.toggle('motion-off')
    try { localStorage.setItem('motion-off', off ? '1' : '0') } catch { /* ignore */ }
  }
  useEffect(() => {
    try { if (localStorage.getItem('motion-off') === '1') document.body.classList.add('motion-off') } catch { /* ignore */ }
  }, [])

  // Global shortcuts: ⌘K palette · F focus · Esc exit focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setFocus(false)
      } else if (!typing && !paletteOpen && e.key.toLowerCase() === 'f') {
        setFocus((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

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
    <div className={cn('min-h-screen', focus && 'is-focus')}>
      {/* Top bar */}
      <header className="pt-safe sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-[54px] max-w-[1120px] items-center gap-3 px-4 md:px-6">
          {/* brand */}
          <button onClick={() => nav('/')} className="flex items-center gap-2.5" aria-label="首页">
            <LogoMark size={28} />
            <span className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg-secondary sm:block">30&nbsp;Days</span>
          </button>

          {/* desktop nav */}
          {!focus && (
            <nav className="ml-2 hidden items-center gap-0.5 md:flex" data-chrome>
              {NAV.map((it) => (
                <NavLink
                  key={it.label}
                  to={it.to === 'today' ? `/day/${current}` : it.to}
                  end={it.end}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
                      isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => {
                    const Icon = it.icon
                    return (
                      <>
                        <Icon size={14} strokeWidth={2} />
                        {it.label}
                        {it.badge && due > 0 && (
                          <span className="t-tab rounded-sm bg-red-soft px-1 text-[10px] font-semibold text-red">{due}</span>
                        )}
                        {isActive && <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-red" />}
                      </>
                    )
                  }}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="flex-1" />

          {/* right cluster */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted transition-colors hover:border-border-strong hover:text-fg sm:flex"
          >
            <Search size={13} /> Jump <kbd className="rounded-sm border border-border-strong bg-surface-2 px-1 text-fg-secondary">⌘K</kbd>
          </button>
          <IconButton label="搜索 / 命令 (⌘K)" className="sm:hidden" onClick={() => setPaletteOpen(true)}>
            <Search size={18} />
          </IconButton>
          {!focus && (
            <IconButton label="专注模式 (F)" onClick={() => setFocus(true)} data-chrome>
              <Crosshair size={18} />
            </IconButton>
          )}
          {focus && (
            <button onClick={() => setFocus(false)} className="rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted hover:text-fg">
              专注中 · ESC
            </button>
          )}
          {!focus && (
            <div className="hidden h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 md:flex" data-chrome>
              <Flame size={15} className={streak > 0 ? 'text-red' : 'text-fg-dim'} />
              <span className="t-tab text-body-lg font-semibold text-fg">{streak}</span>
            </div>
          )}
          {/* auth (passcode / login) — visible on mobile too; it unlocks AI + neural voice */}
          {!focus && <div data-chrome><AuthControls /></div>}
        </div>
      </header>

      {/* Main */}
      <main>
        <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-4 md:px-6 md:pb-16 md:pt-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/day/:day" element={<DayView />} />
            <Route path="/review" element={<Review />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </div>
      </main>

      {/* Mobile bottom tab bar (hidden on study routes and focus) */}
      {!onDayRoute && !focus && (
        <nav data-chrome className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-bg/90 px-4 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden">
          {NAV.map((t) => (
            <NavLink
              key={t.label}
              to={t.to === 'today' ? `/day/${current}` : t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors',
                  isActive ? 'text-fg' : 'text-fg-muted',
                )
              }
            >
              {(() => { const Icon = t.icon; return <Icon size={18} strokeWidth={2} /> })()}
              {t.label}
            </NavLink>
          ))}
          <NavLink to="/progress" className="flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-fg-muted">
            <Settings size={18} strokeWidth={2} />SET
          </NavLink>
        </nav>
      )}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        current={current}
        due={due}
        toggleFocus={() => setFocus((f) => !f)}
        toggleMotion={toggleMotion}
        openTutor={() => window.dispatchEvent(new Event('open-tutor'))}
      />

      {/* Floating AI tutor (only renders when AI is configured + signed in) */}
      <TutorFab lesson={lessonCtx} />
    </div>
  )
}
