import { NavLink, Route, Routes } from 'react-router-dom'
import { Home, RotateCcw, TrendingUp, Rocket } from 'lucide-react'
import Dashboard from './components/Dashboard'
import DayView from './components/DayView'
import Review from './components/Review'
import Progress from './components/Progress'
import { cn } from './lib/utils'

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[840px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-brand to-[#b57edc] shadow-[0_2px_10px_-2px_rgba(94,106,210,0.6)]">
              <Rocket size={17} className="text-white" strokeWidth={2.2} />
            </span>
            <div className="leading-none">
              <div className="text-[14px] font-semibold tracking-tight">30 天英语</div>
              <div className="text-[11px] text-fg-dim">指数级提升 · 听说侧重</div>
            </div>
          </div>
          <NavLink
            to="/review"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:text-fg hover:border-[#2c2e33]"
          >
            <RotateCcw size={13} /> 词卡复习
          </NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-[840px] px-4 pb-28 pt-5">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/day/:day" element={<DayView />} />
          <Route path="/review" element={<Review />} />
          <Route path="/progress" element={<Progress />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[840px] justify-around px-6 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <Tab to="/" end icon={<Home size={19} />} label="首页" />
          <Tab to="/review" icon={<RotateCcw size={19} />} label="复习" />
          <Tab to="/progress" icon={<TrendingUp size={19} />} label="进度" />
        </div>
      </nav>
    </>
  )
}

function Tab({
  to,
  end,
  icon,
  label,
}: {
  to: string
  end?: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-w-[64px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-colors',
          isActive ? 'text-fg' : 'text-fg-dim hover:text-fg-muted',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
