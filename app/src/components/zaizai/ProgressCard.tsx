import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame, Timer } from 'lucide-react'
import { useApp } from '../../state'
import { useAuth } from '../../auth'
import { TOTAL_DAYS } from '../../data/curriculum'
import { displayStreak, getDayProgress } from '../../lib/storage'
import { addDays, todayISO } from '../../lib/srs'
import { Cells } from '../ui'
import { getWallet, loadFrozenDates, walletCap, WALLET_EVENT, type WalletInfo } from '../../lib/zaizai'
import { cn } from '../../lib/utils'

// The quantified spine of the message feed — Day X/30 + today's blocks +
// streak + call-seconds wallet, always visible on top. Tap → course overview.
export default function ProgressCard() {
  const { state } = useApp()
  const { user } = useAuth()
  const nav = useNavigate()
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const done = Object.values(getDayProgress(state, current).completedBlocks).filter(Boolean).length
  const streak = displayStreak(state)
  const showWallet = walletCap() && !!user?.account
  const [wallet, setWallet] = useState<WalletInfo | null>(null)

  // week strip — last 7 LOCAL days, oldest left → today rightmost
  const today = todayISO()
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const studied = new Set(state.studyDates ?? [])
  if (state.lastStudyDate) studied.add(state.lastStudyDate) // pre-v3.2 states have no history
  const frozen = new Set(loadFrozenDates())

  useEffect(() => {
    if (!showWallet) {
      setWallet(null)
      return
    }
    let alive = true
    const load = (force = false) => getWallet(force).then((w) => alive && w && setWallet(w))
    load()
    const onWallet = () => load(true)
    window.addEventListener(WALLET_EVENT, onWallet)
    return () => {
      alive = false
      window.removeEventListener(WALLET_EVENT, onWallet)
    }
  }, [showWallet, user])

  return (
    <button onClick={() => nav('/course')} aria-label="查看课程" className="press glass block w-full rounded-xl px-4 py-3 text-left">
      <div className="flex items-center gap-3.5">
        <div className="shrink-0 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-fg-dim">Day</div>
          <div className="t-doto mt-0.5 text-[34px] font-semibold leading-none text-fg sm:text-[38px]">
            {String(current).padStart(2, '0')}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-sm font-medium text-fg">今日 {done}/5</span>
            <span className={cn('flex items-center gap-0.5 text-sm font-medium', streak > 0 ? 'text-warning' : 'text-fg-dim')}>
              <Flame size={14} />
              {streak}
            </span>
            {showWallet && wallet && (
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-brand">
                <Timer size={11} />
                {Math.floor(wallet.balanceSeconds / 60)} 分钟
              </span>
            )}
            {showWallet && wallet && wallet.freezes > 0 && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-secondary">
                ❄×{wallet.freezes}
              </span>
            )}
          </div>
          <Cells value={done} max={5} height={7} className="mt-2" />
          {/* week strip — filled = studied, ❄ = freeze-covered, today-unfilled pulses */}
          <div className="mt-1.5 flex gap-[3px]" aria-label="最近 7 天学习记录">
            {week.map((d) => {
              const hit = studied.has(d)
              const ice = !hit && frozen.has(d)
              return (
                <span
                  key={d}
                  title={d}
                  className={cn(
                    'grid h-[13px] flex-1 place-items-center rounded-[3px] text-[8px] leading-none',
                    hit ? 'bg-brand text-brand-fg' : ice ? 'bg-accent-soft text-brand' : 'bg-surface-2 text-fg-dim',
                    d === today && !hit && 'animate-pulse',
                  )}
                >
                  {ice ? '❄' : ''}
                </span>
              )
            })}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-fg-dim" />
      </div>
    </button>
  )
}
