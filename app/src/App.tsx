import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle, RotateCcw, BookOpen, User } from 'lucide-react'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'
import Me from './components/Me'
import ChatHome from './components/zaizai/ChatHome'
import { useApp } from './state'
import { useAuth } from './auth'
import { TOTAL_DAYS } from './data/curriculum'
import { dueCards } from './lib/srs'
import { LogoMark } from './components/ui/brand'
import { AuthControls } from './components/ai'
import { CloudSync } from './components/CloudSync'
import { cn } from './lib/utils'

function useNav() {
  const { state } = useApp()
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const due = dueCards(state.cards).length
  return { current, due }
}

// Scroll to top on route change so users never land mid-page.
function useScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
}

// Chrome responds to scroll: hairline + backdrop deepen once the page moves.
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return scrolled
}

const NAV = [
  { to: '/', end: true, icon: MessageCircle, label: '在在' },
  { to: '/course', icon: BookOpen, label: '课程' },
  { to: '/review', icon: RotateCcw, label: '复习', badge: true },
  { to: '/me', icon: User, label: '我的' },
]

export default function App() {
  const { current, due } = useNav()
  const { refresh } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const onDayRoute = loc.pathname.startsWith('/day/')
  const scrolled = useScrolled()
  useScrollTop()

  // Returning from Stripe Checkout (success_url=/?pay=success): membership is
  // granted asynchronously by the webhook, which may land a beat after the
  // redirect. Refresh several times over the first few seconds to catch it. Uses
  // a ref (not [refresh] deps) so the effect runs ONCE and its timers aren't
  // cancelled when `refresh`'s identity changes as auth state settles.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') !== 'success') return
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    const timers = [0, 1500, 3500, 6000].map((d) => window.setTimeout(() => refreshRef.current(), d))
    return () => timers.forEach((t) => clearTimeout(t))
  }, [])

  // 课程 tab owns the 30-day map and stays active on ANY /day/* study route,
  // so study screens keep a nav anchor.
  const isActiveFor = (it: (typeof NAV)[number], linkActive: boolean) =>
    it.to === '/course' ? onDayRoute || linkActive : linkActive

  return (
    <div className="min-h-screen">
      {/* ambient life behind the dot-grid — slow-drifting glows */}
      <div className="ambient" aria-hidden="true">
        <span className="ambient-blob a" />
        <span className="ambient-blob b" />
        <span className="ambient-blob c" />
      </div>
      {/* Top bar */}
      <header
        className={cn(
          'pt-safe sticky top-0 z-40 border-b bg-bg/80 backdrop-blur-md transition-colors duration-200',
          scrolled ? 'border-border-strong bg-bg/95' : 'border-border',
        )}
      >
        <div className="mx-auto flex h-[54px] max-w-[1120px] items-center gap-3 px-4 md:px-6">
          {/* brand */}
          <button onClick={() => nav('/')} className="press flex items-center gap-2.5" aria-label="首页">
            <LogoMark size={28} />
            <span className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg-secondary sm:block">30&nbsp;Days</span>
          </button>

          {/* desktop nav */}
          <nav className="ml-2 hidden items-center gap-0.5 md:flex">
            {NAV.map((it) => (
              <NavLink
                key={it.label}
                to={it.to}
                end={it.end}
                className="relative flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors"
              >
                {({ isActive }) => {
                  const active = isActiveFor(it, isActive)
                  const Icon = it.icon
                  return (
                    <span className={cn('flex items-center gap-2 transition-colors', active ? 'text-fg' : 'text-fg-muted hover:text-fg')}>
                      <Icon size={14} strokeWidth={2} />
                      {it.label}
                      {it.badge && due > 0 && (
                        <span className="t-tab rounded-sm bg-red-soft px-1 text-[10px] font-semibold text-red">{due}</span>
                      )}
                      {/* underline stays mounted — scales in/out instead of popping */}
                      <span
                        className={cn(
                          'absolute inset-x-3 -bottom-[9px] h-[2px] origin-center rounded-full bg-red transition-transform duration-200',
                          active ? 'scale-x-100' : 'scale-x-0',
                        )}
                      />
                    </span>
                  )
                }}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {/* system-online readout — telemetry vibe, one quiet chip */}
          <span className="mr-1 hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim sm:flex">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#30d158]" />
            <span>Day {String(current).padStart(2, '0')}/{TOTAL_DAYS}</span>
          </span>

          {/* auth (account / passcode) — unlocks AI + neural voice + cloud sync */}
          <AuthControls />
        </div>
      </header>

      {/* Main — ONE entrance per navigation (the IN primitive) */}
      <main>
        <div key={loc.pathname} className="animate-in-up mx-auto max-w-[1120px] px-4 pb-24 pt-4 md:px-6 md:pb-16 md:pt-6">
          <Routes>
            <Route path="/" element={<ChatHome />} />
            <Route path="/course" element={<Dashboard />} />
            <Route path="/day/:day" element={<DayView />} />
            <Route path="/ai" element={<Navigate to="/" replace />} />
            <Route path="/review" element={<Review />} />
            <Route path="/me" element={<Me />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </div>
      </main>

      {/* Mobile bottom tab bar (hidden on study routes — the lesson dock owns that space) */}
      {!onDayRoute && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-bg/90 px-4 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md md:hidden">
          {NAV.map((t) => (
            <NavLink
              key={t.label}
              to={t.to}
              end={t.end}
              className="press relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 font-mono text-[9px] uppercase tracking-[0.1em]"
            >
              {({ isActive }) => {
                const active = isActiveFor(t, isActive)
                const Icon = t.icon
                return (
                  <span className={cn('flex flex-col items-center gap-0.5 transition-colors', active ? 'text-fg' : 'text-fg-muted')}>
                    <Icon size={18} strokeWidth={2} />
                    {t.label}
                    <span
                      className={cn(
                        'h-[2px] w-5 origin-center rounded-full bg-red transition-transform duration-200',
                        active ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </span>
                )
              }}
            </NavLink>
          ))}
        </nav>
      )}

      {/* account-mode progress cloud sync (renders nothing) */}
      <CloudSync />
    </div>
  )
}
