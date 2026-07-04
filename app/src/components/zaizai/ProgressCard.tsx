import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame, Timer } from 'lucide-react'
import { useApp } from '../../state'
import { useAuth } from '../../auth'
import { TOTAL_DAYS } from '../../data/curriculum'
import { displayStreak, getDayProgress } from '../../lib/storage'
import { Cells } from '../ui'
import { getWallet, walletCap, WALLET_EVENT, type WalletInfo } from '../../lib/zaizai'
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
          </div>
          <Cells value={done} max={5} height={7} className="mt-2" />
        </div>
        <ChevronRight size={16} className="shrink-0 text-fg-dim" />
      </div>
    </button>
  )
}
