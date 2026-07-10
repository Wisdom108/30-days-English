import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, LogIn, LogOut, Send, Loader2, KeyRound, ChevronDown, Ticket } from 'lucide-react'
import { useAuth } from '../auth'
import { features } from '../config'
import { accessLogin, getIdentity, logout, setPasscode } from '../lib/access'
import { login as accountLogin, register as accountRegister, accountLogout, activateCode, startCheckout } from '../lib/account'
import { paymentAvailable, walletAvailable } from '../lib/caps'
import { invalidateWallet } from '../lib/zaizai'
import { useApp } from '../state'
import { defaultState } from '../lib/storage'
import { aiChat, AIError, type ChatMsg, type LessonCtx } from '../lib/ai'
import { Button, Callout, IconButton, Input, Skeleton, Badge, Sheet, SCRIM } from './ui'
import PlanSheet from './zaizai/PlanSheet'
import { cn } from '../lib/utils'

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// One copy for every unlock prompt (was drifting across three spots).
const UNLOCK_COPY = '解锁 AI 陪练 · 写作批改 · 发音教练 · 进度云同步'

/** Ask the top-bar auth widget to open (used by AiGate deep in the page). */
export const openAccount = () => window.dispatchEvent(new Event('open-account'))

// ============================================================================
// Login — server picks the mode: Cloudflare Access (redirect) or passcode gate.
// ============================================================================

/** Passcode entry — stores it locally, verifies directly, surfaces wrong-passcode. */
function PasscodeForm({ onDone }: { onDone?: () => void }) {
  const { refresh } = useAuth()
  const [pc, setPc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Verify against /me directly (no reliance on provider-effect timing, which
  // used to flash a false error before the refresh resolved).
  const submit = async () => {
    if (!pc.trim() || busy) return
    setError(null)
    setBusy(true)
    setPasscode(pc.trim())
    try {
      const { user } = await getIdentity()
      if (user) {
        refresh()
        onDone?.()
      } else {
        setPasscode('')
        setError('口令不正确，请重试')
      }
    } catch {
      setPasscode('')
      setError('网络错误，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          placeholder="访问口令"
          value={pc}
          onChange={(e) => setPc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
          className="min-w-0 flex-1"
        />
        <Button onClick={submit} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : '进入'}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  )
}

// ============================================================================
// Account sheet — login / register / membership / activation (D1 backend)
// ============================================================================
function AccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, refresh } = useAuth()
  const { importAll } = useApp()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [codeMsg, setCodeMsg] = useState<string | null>(null)
  const [pcOpen, setPcOpen] = useState(false) // 「我有访问口令」fold

  const submit = async () => {
    if (!name.trim() || !pw || busy) return
    setBusy(true)
    setErr(null)
    try {
      await (tab === 'login' ? accountLogin(name.trim(), pw) : accountRegister(name.trim(), pw))
      setPw('')
      invalidateWallet() // new identity → drop the previous account's cached balance
      refresh()
      onOpenChange(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '请求失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    setCodeMsg(null)
    try {
      const u = await activateCode(code.trim())
      setCode('')
      refresh()
      setCodeMsg(`已开通 · 有效期至 ${u.memberUntil ? new Date(u.memberUntil).toLocaleDateString('zh-CN') : '—'}`)
    } catch (e) {
      setCodeMsg(e instanceof Error ? e.message : '激活失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const payAvail = paymentAvailable()
  const buy = async (plan: 'month' | 'quarter' | 'year') => {
    if (busy) return
    setBusy(true)
    setCodeMsg(null)
    try {
      const url = await startCheckout(plan)
      window.location.href = url // → Stripe Checkout (page shows the real price)
    } catch (e) {
      setCodeMsg(e instanceof Error ? e.message : '发起支付失败，请重试')
      setBusy(false)
    }
  }

  const doLogout = async () => {
    await accountLogout()
    // Also drop any passcode fallback identity (a worker with BOTH D1 and
    // APP_PASSCODE would otherwise keep you "signed in"), and clear this browser's
    // local progress so the next person starts clean (their cloud copy re-adopts
    // on login). SYNC_OWNER stays so a returning user still merges, not wipes.
    setPasscode('')
    invalidateWallet()
    importAll(defaultState())
    refresh()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title="账号">
      <div className="space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {user?.account ? (
          <>
            {/* signed in — identity + membership (real D1 account only) */}
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-h3 font-semibold text-fg">
                {(user.email || '?')[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-lg font-semibold text-fg">{user.email}</div>
                <div className="mt-0.5 text-meta text-fg-muted">
                  {user.member
                    ? `会员 · 至 ${user.memberUntil ? new Date(user.memberUntil).toLocaleDateString('zh-CN') : '—'}`
                    : '免费版 · 每日体验额度'}
                </div>
                {!user.member && walletAvailable() && (
                  <div className="mt-0.5 text-meta text-fg-muted">完成练习可赚实时通话时长 → 我的</div>
                )}
              </div>
              {user.member && <Badge variant="red">MEMBER</Badge>}
            </div>

            {/* open / renew membership — Stripe self-serve when configured */}
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="label-nd mb-2 flex items-center gap-1.5"><Sparkles size={12} /> {user.member ? '续费会员' : '开通会员'}</div>
              <p className="mb-3 text-sm text-fg-muted">{UNLOCK_COPY}</p>
              {payAvail ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['month', '月度', '尝鲜'],
                      ['quarter', '季度', '进阶'],
                      ['year', '年度', '最超值'],
                    ] as const).map(([key, name, note]) => (
                      <button
                        key={key}
                        onClick={() => buy(key)}
                        disabled={busy}
                        className="press hand-frame-soft bg-surface p-3 text-center transition-colors hover:border-fg disabled:opacity-50"
                      >
                        <div className="text-h3 font-semibold text-fg">{name}</div>
                        <div className="mt-0.5 text-meta text-fg-muted">{note}</div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-meta text-fg-dim">价格与支付以结算页为准 · 安全支付由 Stripe 提供</p>
                </>
              ) : (
                <p className="text-sm text-fg-dim">在线支付即将开放 —— 现可用下方激活码开通。</p>
              )}
            </div>

            {/* activation code */}
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="label-nd mb-2 flex items-center gap-1.5"><Ticket size={12} /> 激活码</div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="EN30-XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && activate()}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 font-mono uppercase"
                />
                <Button onClick={activate} disabled={busy || !code.trim()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : '激活'}
                </Button>
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                {codeMsg ?? (user.member ? '再次激活可叠加有效期。' : `开通会员 · ${UNLOCK_COPY}`)}
              </p>
            </div>

            <Button variant="ghost" className="w-full" onClick={doLogout}>
              <LogOut size={15} /> 退出登录
            </Button>
          </>
        ) : (
          <>
            {/* signed out OR passcode-only (account:false) — login / register */}
            {user && !user.account && (
              <Callout tone="accent">
                你正通过访问口令使用 · 注册一个账号即可<b>云同步进度</b>、<b>开通/管理会员</b>。
              </Callout>
            )}
            {/* login / register */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1">
              {(['login', 'register'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setErr(null) }}
                  className={cn(
                    'press min-h-10 rounded-sm text-body font-medium transition-colors',
                    tab === t ? 'bg-elevated text-fg shadow-rest' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {t === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>
            <div className="space-y-2.5">
              <Input
                placeholder="用户名（3-20 位）"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                type="password"
                placeholder={tab === 'register' ? '密码（至少 6 位）' : '密码'}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
              />
              {err && <p role="alert" className="text-sm text-danger">{err}</p>}
              <Button className="w-full" size="lg" onClick={submit} disabled={busy || !name.trim() || !pw}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : tab === 'login' ? '登录' : '注册并登录'}
              </Button>
            </div>
            <p className="text-center text-sm text-fg-muted">注册即可云同步学习进度 · {UNLOCK_COPY}</p>

            {/* 已有访问口令的老用户 — 折叠行,展开即现成的口令表单 */}
            <div className="border-t border-border-soft">
              <button
                onClick={() => setPcOpen((o) => !o)}
                aria-expanded={pcOpen}
                className="flex min-h-11 w-full items-center justify-between text-sm text-fg-secondary transition-colors hover:text-fg"
              >
                <span className="flex items-center gap-1.5"><KeyRound size={14} /> 我有访问口令</span>
                <ChevronDown size={15} className={cn('transition-transform duration-200', pcOpen && 'rotate-180')} />
              </button>
              {pcOpen && (
                <div className="animate-in-up pb-1">
                  <PasscodeForm onDone={() => onOpenChange(false)} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Compact auth widget (top bar). */
export function AuthControls() {
  const { user, authEnabled, loading, mode, refresh } = useAuth()
  const [open, setOpen] = useState(false)

  // AiGate (deep in a lesson) can summon the sheet.
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('open-account', on)
    return () => window.removeEventListener('open-account', on)
  }, [])

  if (!authEnabled || mode === 'open') return null
  // Only show the skeleton on the FIRST load. During a refresh() we already have
  // a user, so keep rendering the avatar + open sheet (a refresh must not unmount
  // AccountSheet — that used to wipe the activation message and flicker the sheet).
  if (loading && !user) return <Skeleton className="h-11 w-11 rounded-lg" />

  // ---- account mode (D1 membership) ----
  // "Signed in" for UI purposes = a REAL D1 account (account:true). A passcode
  // "owner" is account:false — treat them as signed-out so they get an explicit
  // 登录/注册 path (activation + payment both require a real account anyway).
  if (mode === 'account') {
    return (
      <>
        {user?.account ? (
          <button
            onClick={() => setOpen(true)}
            aria-label="账号"
            title={user.email}
            className="press relative grid h-11 w-11 place-items-center rounded-lg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-label font-semibold text-fg">
              {(user.email || '?')[0].toUpperCase()}
            </span>
            {user.member && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red" />}
          </button>
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)}><LogIn size={15} /> 登录 / 注册</Button>
        )}
        <AccountSheet open={open} onOpenChange={setOpen} />
        {/* 方案对比 (§8.4) — 全局单例,openPlans() 从任何页面唤起(account 模式才有会员概念) */}
        <PlanSheet />
      </>
    )
  }

  const doLogout = () => {
    if (mode === 'passcode') {
      setPasscode('')
      refresh()
    } else {
      logout()
    }
  }

  if (user) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-label font-semibold text-fg" title={user.email}>
          {(user.email || '?')[0].toUpperCase()}
        </span>
        <IconButton label="登出" size="sm" onClick={doLogout}><LogOut size={15} /></IconButton>
      </div>
    )
  }
  if (mode === 'access') {
    return (
      <Button variant="secondary" onClick={accessLogin}><LogIn size={15} /> 解锁</Button>
    )
  }
  // passcode mode
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary"><KeyRound size={15} /> 口令</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={SCRIM} />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up data-[state=closed]:animate-out">
          <Dialog.Title className="text-h2 font-semibold text-fg">输入访问口令</Dialog.Title>
          <p className="mb-3 mt-1 text-sm text-fg-muted">{UNLOCK_COPY}</p>
          <PasscodeForm onDone={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ============================================================================
// AI gate — wrap any AI feature; shows the right prompt when unavailable
// ============================================================================
export function AiGate({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const { user, authEnabled, loading, mode } = useAuth()

  if (!features.ai || !authEnabled) {
    return (
      <Callout tone="warning" icon={<Sparkles size={15} className="text-fg-muted" />}>
        AI 功能需配置后端（CF Worker）后启用。见 SETUP.md。
      </Callout>
    )
  }
  if (loading) {
    return <Skeleton className="h-11 rounded-lg" />
  }
  if (!user) {
    return (
      <Callout tone="accent" icon={<Sparkles size={15} className="text-fg-muted" />}>
        {mode === 'passcode' ? (
          <div className="space-y-2">
            <span>输入访问口令 · {UNLOCK_COPY}</span>
            <PasscodeForm />
          </div>
        ) : (
          <div className={cn('flex items-center justify-between gap-3', compact && 'flex-col items-stretch')}>
            <span>登录后{UNLOCK_COPY}</span>
            <Button size="sm" onClick={mode === 'account' ? openAccount : accessLogin}>登录</Button>
          </div>
        )}
      </Callout>
    )
  }
  return <>{children}</>
}

// ============================================================================
// Reusable chat thread
// ============================================================================
export function ChatThread({
  messages,
  busy,
  onSend,
  placeholder = '输入…',
  emptyHint,
}: {
  messages: ChatMsg[]
  busy: boolean
  onSend: (text: string) => void
  placeholder?: string
  emptyHint?: ReactNode
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth' })
  }, [messages, busy])

  const grow = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 112) + 'px'
  }

  const send = () => {
    const t = draft.trim()
    if (!t || busy) return
    setDraft('')
    if (taRef.current) taRef.current.style.height = 'auto'
    onSend(t)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto p-1" role="log" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && emptyHint && (
          <div className="py-6 text-center text-sm text-fg-muted">{emptyHint}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('animate-in-up flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {/* same bubble language as the 在在 chat (iMessage flat fills) */}
            <div className={cn('max-w-[85%] whitespace-pre-wrap text-chat', m.role === 'user' ? 'bubble-me' : 'bubble-ai')}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bubble-ai flex items-center gap-1 px-3.5 py-3" aria-label="思考中">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={taRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onInput={grow}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={placeholder}
          className="text-chat max-h-28 min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <Button size="icon" className="h-11 w-11 shrink-0" disabled={busy || !draft.trim()} onClick={send} aria-label="发送">
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Conversation practice (对话陪练) — used inside SpeakingBlock
// ============================================================================
export function ConversationPanel({ lesson, scenario }: { lesson: LessonCtx; scenario?: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const send = async (text: string) => {
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setBusy(true)
    setErr(null)
    try {
      const { reply } = await aiChat(next, lesson, scenario)
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setErr(e instanceof AIError ? e.message : '出错了，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-[min(380px,55dvh)]">
      <ChatThread
        messages={messages}
        busy={busy}
        onSend={send}
        placeholder="用英文回复 AI…"
        emptyHint={
          <>
            和 AI 用英文就今天的情景对话吧 —— 它会陪你聊、温柔纠错、带着话题往下走。
            <br />
            先打个招呼试试？
          </>
        }
      />
      {err && <Callout tone="red" role="alert" className="mt-2">{err}</Callout>}
    </div>
  )
}

// (TutorFab 已删除 — 全仓无挂载点的死码;私教入口统一走 AiPartner / 在在聊天。)
