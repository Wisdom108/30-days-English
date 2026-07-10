import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BellRing, Brain, Check, Heart, Loader2, LogIn, Medal,
  Settings2, Sparkles, Star, Target, X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { config } from '../config'
import { authHeaders } from '../lib/access'
import { pushAvailable } from '../lib/caps'
import { isPushSubscribed, subscribe, unsubscribePush } from '../lib/push'
import { getWallet, walletCap, WALLET_EVENT, type WalletInfo } from '../lib/zaizai'
import { openAccount } from './ai'
import { openPlans } from './zaizai/PlanSheet'
import { Badge, Button, Cell, CellGroup, IconButton, Skeleton } from './ui'
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

// iOS insetGrouped section header — aligned to the cells' 16px inset.
function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="label-nd mb-1.5 px-4">{children}</div>
}

type WalletStatus = 'loading' | 'loaded' | 'error'

function WalletSection({ isAccount, wallet, status, onRetry }: {
  isAccount: boolean
  wallet: WalletInfo | null
  status: WalletStatus
  onRetry: () => void
}) {
  if (!isAccount) {
    return (
      <section>
        <GroupLabel>额度钱包</GroupLabel>
        <CellGroup>
          <Cell className="py-3 text-sm text-fg-muted">
            完成每日练习即可赚取实时通话时长 —— 学得越多,聊得越久。
          </Cell>
          <Cell onClick={openAccount} chevron>
            <LogIn size={17} className="shrink-0 text-brand" />
            <span className="text-brand">注册开启额度钱包</span>
          </Cell>
        </CellGroup>
      </section>
    )
  }

  const dayStart = new Date().setHours(0, 0, 0, 0)
  const today = wallet?.ledger.filter((l) => l.at >= dayStart) ?? []

  return (
    <section>
      <GroupLabel>额度钱包</GroupLabel>
      {status === 'error' && !wallet ? (
        // getWallet 对 401/网络错都返回 null,无法区分 — 文案同时覆盖两种路径
        <CellGroup>
          <Cell className="py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg-secondary">额度加载失败</p>
              <p className="mt-0.5 text-meta text-fg-muted">
                网络波动可重试;若登录已过期,请
                <button onClick={openAccount} className="text-fg-secondary underline underline-offset-2">重新登录</button>
              </p>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={onRetry}>重试</Button>
          </Cell>
        </CellGroup>
      ) : !wallet ? (
        <Skeleton className="h-24 rounded-[10px]" />
      ) : (
        <>
          <CellGroup>
            {/* balance readout — the ONE Doto numeral on this page */}
            <Cell className="py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="t-doto text-[40px] font-semibold leading-none text-fg">{mins(wallet.balanceSeconds)}</span>
                  <span className="text-body text-fg-muted">分钟通话时长</span>
                </div>
                <p className="mt-1.5 text-meta text-fg-muted">每通实战电话约花 {mins(wallet.callCost)} 分钟 · 学习赚取,当日有上限</p>
              </div>
            </Cell>
            {/* earn rules */}
            {Object.entries(wallet.rules).map(([event, r]) => (
              <Cell key={event}>
                <span className="min-w-0 flex-1 text-sm text-fg">{EARN_LABELS[event] ?? event}</span>
                <span className="shrink-0 text-meta text-fg-muted">每日 ×{r.dailyCap}</span>
                <span className="t-tab w-14 shrink-0 text-right text-sm font-semibold text-success">+{mins(r.seconds)} 分钟</span>
              </Cell>
            ))}
            {/* streak freezes */}
            <Cell className="py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-fg">❄️ 冻结券</div>
                <div className="mt-0.5 text-meta text-fg-muted">漏学一天自动续上连胜 · 里程碑送 1 张 · 会员每月 2 张</div>
              </div>
              <span className="t-tab shrink-0 text-sm font-semibold text-fg">{wallet.freezes} 张</span>
            </Cell>
          </CellGroup>

          {/* today's ledger */}
          <div className="mt-5">
            <GroupLabel>今日台账</GroupLabel>
            <CellGroup>
              {today.length === 0 ? (
                <Cell className="text-sm text-fg-muted">今天还没有记录 —— 完成一块练习就有进账。</Cell>
              ) : (
                today.map((l, i) => (
                  <Cell key={i}>
                    <span className="t-tab shrink-0 text-meta text-fg-dim">
                      {new Date(l.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-fg-secondary">{REASON_LABELS[l.reason] ?? l.reason}</span>
                    <span className={cn('t-tab shrink-0 text-sm font-semibold', l.delta > 0 ? 'text-success' : 'text-red')}>
                      {l.delta > 0 ? '+' : '−'}{mins(Math.abs(l.delta))} 分钟
                    </span>
                  </Cell>
                ))
              )}
            </CellGroup>
          </div>
        </>
      )}
    </section>
  )
}

function BadgeSection({ earned }: { earned: Set<string> }) {
  return (
    <section>
      <GroupLabel>徽章 · <span className="t-tab">{earned.size}/{BADGES.length}</span></GroupLabel>
      <CellGroup>
        {BADGES.map((b) => {
          const got = earned.has(b.id)
          return (
            <Cell key={b.id} className={cn('py-2.5', !got && 'opacity-55')}>
              <Medal size={18} className={cn('shrink-0', got ? 'text-warning' : 'text-fg-dim')} />
              <div className="min-w-0 flex-1">
                <div className={cn('text-sm font-medium', got ? 'text-fg' : 'text-fg-secondary')}>{b.name_zh}</div>
                <div className="mt-0.5 text-meta text-fg-muted">
                  {b.desc_zh}
                  {b.unlock && <span className={got ? 'text-brand' : undefined}> · 解锁声线 {b.unlock.replace('voice:', '')}</span>}
                </div>
              </div>
              {got && <Check size={17} strokeWidth={2.5} className="shrink-0 text-brand" />}
            </Cell>
          )
        })}
      </CellGroup>
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

function MemorySection({ isAccount }: { isAccount: boolean }) {
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
    <section>
      <GroupLabel>在在记得你</GroupLabel>
      <CellGroup>
        {!isAccount ? (
          <>
            <Cell className="py-3 text-sm text-fg-muted">
              注册后在在才能记住你 —— 目标、弱点、聊过的事,都会写进它的长期记忆。
            </Cell>
            <Cell onClick={openAccount} chevron>
              <LogIn size={17} className="shrink-0 text-brand" />
              <span className="text-brand">注册解锁记忆</span>
            </Cell>
          </>
        ) : mems === null ? (
          <Cell><Skeleton className="h-5 w-full" /></Cell>
        ) : mems.length === 0 ? (
          <Cell className="text-sm text-fg-muted">还没有记忆 —— 去和在在多聊几句,它会记住重要的事。</Cell>
        ) : (
          mems.map((m) => {
            const Icon = MEM_ICONS[m.kind] ?? Brain
            return (
              <Cell key={m.id} className="py-1 pr-2">
                <Icon size={15} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 text-sm text-fg-secondary">{m.text}</span>
                <span className="t-tab shrink-0 text-meta text-fg-dim">{rel(m.at)}</span>
                <IconButton label="删除这条记忆" size="sm" onClick={() => remove(m.id)}><X size={13} /></IconButton>
              </Cell>
            )
          })
        )}
      </CellGroup>
    </section>
  )
}

// ---- morning call (§8.2) — Web Push 订阅开关,lib/push 由 F2 提供 ----
const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function PushCell() {
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
    <Cell className="py-2.5">
      <BellRing size={17} className="shrink-0 text-fg-secondary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg">在在的 morning call</div>
        <p className="mt-0.5 text-meta text-fg-muted">每天早上推一句话,叫你回来开口</p>
      </div>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={toggle} disabled={busy || on === null}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : on ? '关闭' : '开启'}
      </Button>
    </Cell>
  )
}

// 我的 — 钱包 + 徽章 + 记忆 + 账号 + 设置,全部 iOS insetGrouped 制式。
// AccountSheet 与 PlanSheet 由顶栏 AuthControls 全局挂载,这里只
// openAccount()/openPlans() 唤起。
export default function Me() {
  const { user, authEnabled, mode } = useAuth()
  const nav = useNavigate()
  const isAccount = !!user?.account
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('loading')
  const [walletRetry, setWalletRetry] = useState(0)

  useEffect(() => {
    if (!isAccount) {
      setWallet(null)
      setWalletStatus('loading')
      return
    }
    let alive = true
    const load = (force = false) => {
      // 已加载后的刷新失败不得清掉在展示的数据,也不得打回骨架
      setWalletStatus((s) => (s === 'loaded' ? s : 'loading'))
      getWallet(force).then((w) => {
        if (!alive) return
        if (w) {
          setWallet(w)
          setWalletStatus('loaded')
        } else {
          setWalletStatus((s) => (s === 'loaded' ? s : 'error'))
        }
      })
    }
    load(walletRetry > 0) // 重试必须绕过 getWallet 缓存
    const onWallet = () => load(true)
    window.addEventListener(WALLET_EVENT, onWallet)
    return () => {
      alive = false
      window.removeEventListener(WALLET_EVENT, onWallet)
    }
  }, [isAccount, walletRetry])

  return (
    <div className="mx-auto max-w-[560px] space-y-5">
      {/* mobile title lives in the global nav bar — desktop keeps the page h1 */}
      <h1 className="hidden text-h1 font-semibold text-fg md:block">我的</h1>

      {walletCap() && (
        <WalletSection
          isAccount={isAccount}
          wallet={wallet}
          status={walletStatus}
          onRetry={() => setWalletRetry((n) => n + 1)}
        />
      )}

      <BadgeSection earned={new Set(wallet?.badges ?? [])} />

      {mode === 'account' && <MemorySection isAccount={isAccount} />}

      {/* account */}
      <section>
        <GroupLabel>账号</GroupLabel>
        <CellGroup>
          {!authEnabled || mode === 'open' ? (
            <Cell className="text-sm text-fg-muted">当前为开放模式,无需账号。</Cell>
          ) : isAccount && user ? (
            <Cell onClick={openAccount} chevron className="py-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-h3 font-semibold text-fg">
                {(user.email || '?')[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-fg">{user.email}</span>
                  {user.member && <Badge variant="red">MEMBER</Badge>}
                </div>
                <div className="mt-0.5 text-meta text-fg-muted">
                  {user.member
                    ? `会员 · 至 ${user.memberUntil ? new Date(user.memberUntil).toLocaleDateString('zh-CN') : '—'}`
                    : '免费版 · 每日体验额度'}
                </div>
              </div>
            </Cell>
          ) : (
            /* guest — one clear sign-in entry */
            <Cell onClick={openAccount} chevron>
              <LogIn size={17} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 text-brand">登录 / 注册</span>
              <span className="shrink-0 text-meta text-fg-muted">云同步 · 赚通话额度</span>
            </Cell>
          )}
          {/* 三档方案对比入口 (§8.4) — PlanSheet 只在 account 模式挂载 */}
          {mode === 'account' && (
            <Cell onClick={openPlans} chevron>
              <Sparkles size={16} className="shrink-0 text-fg-secondary" />
              <span className="min-w-0 flex-1 text-sm">方案对比 · 免费 / 会员 / 课程包</span>
            </Cell>
          )}
        </CellGroup>
      </section>

      {/* settings — morning call 开关(服务端有 push 能力 + 已登录 + 浏览器支持才露出) + 数据入口 */}
      <section>
        <CellGroup>
          {pushAvailable() && isAccount && pushSupported() && <PushCell />}
          <Cell onClick={() => nav('/progress')} chevron>
            <Settings2 size={17} className="shrink-0 text-fg-secondary" />
            <span className="min-w-0 flex-1 text-sm">数据与设置</span>
          </Cell>
        </CellGroup>
      </section>
    </div>
  )
}
