import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BellRing, Brain, ChevronRight, Heart, Loader2, LogIn, Medal,
  Settings2, Sparkles, Star, Target, Timer, X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { config } from '../config'
import { authHeaders } from '../lib/access'
import { pushAvailable } from '../lib/caps'
import { isPushSubscribed, subscribe, unsubscribePush } from '../lib/push'
import { getWallet, walletCap, WALLET_EVENT, type WalletInfo } from '../lib/zaizai'
import { openAccount } from './ai'
import { openPlans } from './zaizai/PlanSheet'
import { Badge, Button, IconButton, Skeleton } from './ui'
import { useToast } from './ui/toast'
import { cn } from '../lib/utils'

// §3.1 BADGES 镜像 — 服务端真源在 worker/src/wallet.ts,此处只做展示。
const BADGES: { id: string; name_zh: string; desc_zh: string; unlock?: string }[] = [
  { id: 'first_call', name_zh: '初通电话', desc_zh: '完成第一通实时通话' },
  { id: 'streak_7', name_zh: '七日不断', desc_zh: '连续学习 7 天', unlock: 'voice:rex' },
  { id: 'scenario_3', name_zh: '场景新手', desc_zh: '完成 3 次场景演练', unlock: 'voice:leo' },
  { id: 'scenario_10', name_zh: '场景老手', desc_zh: '完成 10 次场景演练' },
  { id: 'day_10', name_zh: '生存毕业', desc_zh: '完成 Day 1–10' },
  { id: 'day_20', name_zh: '生活自如', desc_zh: '完成 Day 11–20' },
  { id: 'day_30', name_zh: '出师', desc_zh: '完成全部 30 天' },
]

const EARN_LABELS: Record<string, string> = {
  block_complete: '完成一个练习块',
  day_complete: '完成当天全部 5 块',
  scenario_complete: '完成场景演练',
  streak_milestone: '连胜 7/14/21/30 天',
}

const REASON_LABELS: Record<string, string> = {
  'earn:block_complete': '练习块',
  'earn:day_complete': '整天完成',
  'earn:scenario_complete': '场景演练',
  'earn:streak_milestone': '连胜里程碑',
  'spend:grok_call': '实时通话',
  'refund:grok_call': '通话退款',
}

const mins = (seconds: number) => Math.floor(seconds / 60)

function WalletCard({ isAccount, wallet }: { isAccount: boolean; wallet: WalletInfo | null }) {
  if (!isAccount) {
    return (
      <section className="glass rounded-xl p-4">
        <div className="label-nd mb-2 flex items-center gap-1.5"><Timer size={12} /> 额度钱包</div>
        <p className="text-sm text-fg-muted">完成每日练习即可赚取实时通话时长 —— 学得越多,聊得越久。</p>
        <Button className="mt-3 w-full" onClick={openAccount}><LogIn size={15} /> 注册开启额度钱包</Button>
      </section>
    )
  }

  const dayStart = new Date().setHours(0, 0, 0, 0)
  const today = wallet?.ledger.filter((l) => l.at >= dayStart) ?? []

  return (
    <section className="glass rounded-xl p-4">
      <div className="label-nd mb-2 flex items-center gap-1.5"><Timer size={12} /> 额度钱包</div>
      {!wallet ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="t-doto text-[40px] font-semibold leading-none text-fg">{mins(wallet.balanceSeconds)}</span>
            <span className="text-body text-fg-muted">分钟通话时长</span>
          </div>
          <p className="mt-1.5 text-meta text-fg-muted">每通实战电话约花 {mins(wallet.callCost)} 分钟 · 学习赚取,当日有上限</p>

          {/* earn rules */}
          <div className="mt-3 space-y-1 border-t border-border-soft pt-3">
            {Object.entries(wallet.rules).map(([event, r]) => (
              <div key={event} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-fg-secondary">{EARN_LABELS[event] ?? event}</span>
                <span className="text-meta text-fg-muted">每日 ×{r.dailyCap}</span>
                <span className="t-tab w-14 text-right font-semibold text-success">+{mins(r.seconds)} 分钟</span>
              </div>
            ))}
          </div>

          {/* streak freezes */}
          <div className="mt-3 border-t border-border-soft pt-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-fg-secondary">❄ 冻结券 · 漏学一天自动续上连胜</span>
              <span className="t-tab font-semibold text-fg">{wallet.freezes} 张</span>
            </div>
            <p className="mt-0.5 text-meta text-fg-muted">获取方式:连胜里程碑送 1 张 · 会员每月 2 张</p>
          </div>

          {/* today's ledger */}
          <div className="mt-3 border-t border-border-soft pt-3">
            <div className="label-nd mb-1.5">今日台账</div>
            {today.length === 0 ? (
              <p className="text-sm text-fg-muted">今天还没有记录 —— 完成一块练习就有进账。</p>
            ) : (
              <div className="space-y-1">
                {today.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="t-tab text-meta text-fg-dim">
                      {new Date(l.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1 text-fg-secondary">{REASON_LABELS[l.reason] ?? l.reason}</span>
                    <span className={cn('t-tab font-semibold', l.delta > 0 ? 'text-success' : 'text-red')}>
                      {l.delta > 0 ? '+' : '−'}{mins(Math.abs(l.delta))} 分钟
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function BadgeWall({ earned }: { earned: Set<string> }) {
  return (
    <section className="glass rounded-xl p-4">
      <div className="label-nd mb-3 flex items-center gap-1.5">
        <Medal size={12} /> 徽章墙
        <span className="t-tab ml-auto text-fg-dim">{earned.size}/{BADGES.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BADGES.map((b) => {
          const got = earned.has(b.id)
          return (
            <div key={b.id} className={cn('rounded-lg border p-3', got ? 'border-border-strong bg-surface' : 'border-border-soft opacity-55')}>
              <div className={cn('flex items-center gap-1.5 text-body font-semibold', got ? 'text-fg' : 'text-fg-muted')}>
                <Medal size={14} className={got ? 'text-warning' : 'text-fg-dim'} />
                <span className="truncate">{b.name_zh}</span>
              </div>
              <p className="mt-1 text-meta text-fg-muted">{b.desc_zh}</p>
              {b.unlock && (
                <p className={cn('mt-0.5 text-meta', got ? 'text-brand' : 'text-fg-dim')}>
                  解锁声线 {b.unlock.replace('voice:', '')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---- 在在记得你 (§8.2) — D1 memories 可见 + 可删 ----
interface MemoryItem { id: number; kind: string; text: string; at: number }

const MEM_ICONS: Record<string, typeof Brain> = {
  plan: Target,
  weakness: AlertTriangle,
  highlight: Star,
  quirk: Sparkles,
  pref: Heart,
}

/** 相对时间,中文短格式。 */
function rel(at: number): string {
  const m = Math.floor(Math.max(0, Date.now() - at) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

function MemoryWall({ isAccount }: { isAccount: boolean }) {
  const [mems, setMems] = useState<MemoryItem[] | null>(null)

  useEffect(() => {
    if (!isAccount) return
    let alive = true
    fetch(`${config.workerUrl}/memories`, { credentials: 'include', headers: authHeaders() })
      .then((r) => (r.ok ? (r.json() as Promise<{ memories?: MemoryItem[] }>) : null))
      // non-ok → empty list (never leave the skeleton spinning forever)
      .then((d) => alive && setMems(d && Array.isArray(d.memories) ? d.memories : []))
      .catch(() => alive && setMems([]))
    return () => { alive = false }
  }, [isAccount])

  // 乐观删除 — 先从列表移除,DELETE 静默发出(幂等,失败下次刷新会回来)。
  const remove = (id: number) => {
    setMems((m) => (m ? m.filter((x) => x.id !== id) : m))
    fetch(`${config.workerUrl}/memories/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() }).catch(() => {})
  }

  return (
    <section className="glass rounded-xl p-4">
      <div className="label-nd mb-2 flex items-center gap-1.5"><Brain size={12} /> 在在记得你</div>
      {!isAccount ? (
        <>
          <p className="text-sm text-fg-muted">注册后在在才能记住你 —— 目标、弱点、聊过的事,都会写进它的长期记忆。</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={openAccount}><LogIn size={15} /> 注册解锁记忆</Button>
        </>
      ) : mems === null ? (
        <Skeleton className="h-12 rounded-lg" />
      ) : mems.length === 0 ? (
        <p className="text-sm text-fg-muted">还没有记忆 —— 去和在在多聊几句,它会记住重要的事。</p>
      ) : (
        <div className="space-y-0.5">
          {mems.map((m) => {
            const Icon = MEM_ICONS[m.kind] ?? Brain
            return (
              <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                <Icon size={14} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 text-sm text-fg-secondary">{m.text}</span>
                <span className="t-tab shrink-0 text-meta text-fg-dim">{rel(m.at)}</span>
                <IconButton label="删除这条记忆" size="sm" onClick={() => remove(m.id)}><X size={13} /></IconButton>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ---- morning call (§8.2) — Web Push 订阅开关,lib/push 由 F2 提供 ----
const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function PushRow() {
  const { toast } = useToast()
  const [on, setOn] = useState<boolean | null>(null) // null = 状态未知(查询中)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    isPushSubscribed().then((v: boolean) => alive && setOn(v)).catch(() => alive && setOn(false))
    return () => { alive = false }
  }, [])

  const toggle = async () => {
    if (busy || on === null) return
    setBusy(true)
    try {
      if (on) {
        await unsubscribePush()
        setOn(false)
      } else {
        const r = await subscribe() // 内部含权限申请;never throws
        setOn(r.ok)
        if (!r.ok) toast({ title: r.reason || '开启失败', tone: 'error' })
      }
    } catch {
      isPushSubscribed().then(setOn).catch(() => setOn(false)) // 失败按真实状态回摆
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="glass flex items-center gap-3 rounded-xl px-4 py-3.5">
      <BellRing size={16} className="shrink-0 text-fg-secondary" />
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-fg">在在的 morning call</div>
        <p className="mt-0.5 text-meta text-fg-muted">每天早上推一句话,叫你回来开口</p>
      </div>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={toggle} disabled={busy || on === null}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : on ? '关闭' : '开启'}
      </Button>
    </section>
  )
}

// 我的 — 钱包 + 徽章墙 + 记忆墙 + 账号入口 + 数据/设置链接。AccountSheet 与
// PlanSheet 由顶栏 AuthControls 全局挂载,这里只 openAccount()/openPlans() 唤起。
export default function Me() {
  const { user, authEnabled, mode } = useAuth()
  const nav = useNavigate()
  const isAccount = !!user?.account
  const [wallet, setWallet] = useState<WalletInfo | null>(null)

  useEffect(() => {
    if (!isAccount) {
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
  }, [isAccount])

  return (
    <div className="mx-auto max-w-[560px] space-y-3">
      <h1 className="text-h1 font-semibold text-fg">我的</h1>

      {walletCap() && <WalletCard isAccount={isAccount} wallet={wallet} />}

      <BadgeWall earned={new Set(wallet?.badges ?? [])} />

      {mode === 'account' && <MemoryWall isAccount={isAccount} />}

      {/* account card */}
      <section className="glass rounded-xl p-4">
        {!authEnabled || mode === 'open' ? (
          <p className="text-sm text-fg-muted">当前为开放模式,无需账号。</p>
        ) : isAccount && user ? (
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-h3 font-semibold text-fg">
              {(user.email || '?')[0].toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-body-lg font-semibold text-fg">{user.email}</span>
                {user.member && <Badge variant="red">MEMBER</Badge>}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">
                {user.member
                  ? `会员 · 至 ${user.memberUntil ? new Date(user.memberUntil).toLocaleDateString('zh-CN') : '—'}`
                  : '免费版 · 每日体验额度'}
              </div>
            </div>
            <Button variant="secondary" onClick={openAccount}>账号管理</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-body font-semibold text-fg">还没有账号</div>
              <p className="mt-0.5 text-sm text-fg-muted">注册即可云同步进度、赚取通话额度。</p>
            </div>
            <Button onClick={openAccount}><LogIn size={15} /> 登录 / 注册</Button>
          </div>
        )}
        {/* 三档方案对比入口 (§8.4) — PlanSheet 只在 account 模式挂载 */}
        {mode === 'account' && (
          <button onClick={openPlans} className="press mt-3 flex w-full items-center gap-1.5 border-t border-border-soft pt-3 text-left text-sm text-fg-secondary transition-colors hover:text-fg">
            <Sparkles size={13} className="shrink-0" /> 方案对比 · 免费 / 会员 / 课程包
            <ChevronRight size={14} className="ml-auto shrink-0 text-fg-dim" />
          </button>
        )}
      </section>

      {/* morning call 开关 — 服务端有 push 能力 + 已登录 + 浏览器支持才露出 */}
      {pushAvailable() && isAccount && pushSupported() && <PushRow />}

      {/* links */}
      <button onClick={() => nav('/progress')} className="press glass flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left">
        <Settings2 size={16} className="shrink-0 text-fg-secondary" />
        <span className="flex-1 text-body font-medium text-fg">数据与设置</span>
        <ChevronRight size={15} className="shrink-0 text-fg-dim" />
      </button>
    </div>
  )
}
