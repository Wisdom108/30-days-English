import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, LogIn, LogOut, Send, Bot, Loader2, KeyRound } from 'lucide-react'
import { useAuth } from '../auth'
import { features } from '../config'
import { accessLogin, logout, setPasscode } from '../lib/access'
import { aiChat, aiTutor, AIError, type ChatMsg, type LessonCtx } from '../lib/ai'
import { Button, Callout, IconButton, Input, Skeleton, Badge, Sheet } from './ui'
import { cn } from '../lib/utils'

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ============================================================================
// Login — server picks the mode: Cloudflare Access (redirect) or passcode gate.
// ============================================================================

/** Passcode entry — stores it locally, refreshes auth, surfaces wrong-passcode. */
function PasscodeForm({ onDone }: { onDone?: () => void }) {
  const { refresh, user, loading } = useAuth()
  const [pc, setPc] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After a submit triggers a refresh, watch the resolved identity: close on
  // success, show an inline error on failure (instead of silently closing).
  useEffect(() => {
    if (!submitted || loading) return
    setSubmitted(false)
    if (user) onDone?.()
    else setError('口令不正确，请重试')
  }, [submitted, loading, user]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!pc.trim()) return
    setError(null)
    setPasscode(pc.trim())
    setSubmitted(true)
    refresh()
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
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="min-w-0 flex-1"
        />
        <Button onClick={submit} disabled={submitted}>进入</Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  )
}

/** Compact auth widget (top bar). */
export function AuthControls() {
  const { user, authEnabled, loading, mode, refresh } = useAuth()
  const [open, setOpen] = useState(false)
  if (!authEnabled || mode === 'open') return null
  if (loading) return <Skeleton className="h-11 w-11 rounded-lg" />

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up">
          <Dialog.Title className="text-h2 font-semibold text-fg">输入访问口令</Dialog.Title>
          <p className="mb-3 mt-1 text-sm text-fg-muted">解锁 AI 对话陪练 / 写作批改 / 发音教练 / 私教答疑。</p>
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
            <span>输入访问口令解锁 · 对话陪练 / 写作批改 / 发音教练 / 私教答疑</span>
            <PasscodeForm />
          </div>
        ) : (
          <div className={cn('flex items-center justify-between gap-3', compact && 'flex-col items-stretch')}>
            <span>登录后解锁 · 对话陪练 / 写作批改 / 发音教练 / 私教答疑</span>
            <Button size="sm" onClick={accessLogin}>登录</Button>
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
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-body leading-relaxed',
                m.role === 'user'
                  ? 'bg-brand text-brand-fg'
                  : 'border border-border bg-surface-2 text-fg',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
              <Loader2 size={13} className="animate-spin" /> 思考中…
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={placeholder}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-body text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30"
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
    <div className="h-[380px]">
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

// ============================================================================
// Floating private tutor (私教答疑) — mounted globally, context = current day
// ============================================================================
export function TutorFab({ lesson, hidden }: { lesson: LessonCtx; hidden?: boolean }) {
  const { user, authEnabled } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Opened from the command palette (⌘K → Ask AI tutor).
  useEffect(() => {
    const openIt = () => setOpen(true)
    window.addEventListener('open-tutor', openIt)
    return () => window.removeEventListener('open-tutor', openIt)
  }, [])

  // Only for signed-in users — signed-out access is via the top-bar login entry.
  if (!features.ai || !authEnabled || !user || hidden) return null

  const ask = async (text: string) => {
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setBusy(true)
    setErr(null)
    try {
      const { reply } = await aiTutor(text, lesson, messages.slice(-8))
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      setErr(e instanceof AIError ? e.message : '出错了，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="问 AI 私教"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-border-strong bg-elevated text-fg shadow-[var(--shadow-popover)] transition-transform hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:bottom-6 md:right-6"
      >
        <Bot size={20} />
      </button>
      <Sheet open={open} onOpenChange={setOpen} side="bottom" className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Bot size={17} className="text-fg" />
            <span className="label-nd">AI Tutor</span>
            {lesson.day ? <Badge variant="accent"><span className="t-tab">Day {lesson.day}</span></Badge> : null}
          </div>
          <Dialog.Close asChild>
            <IconButton label="关闭"><span className="text-lg leading-none">×</span></IconButton>
          </Dialog.Close>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="min-h-0 flex-1">
            <ChatThread
              messages={messages}
              busy={busy}
              onSend={ask}
              placeholder="问语法、用法、为什么这么说…"
              emptyHint="随时问我英语问题 —— 我会用中文讲清楚，配上英文例句，结合今天的课。"
            />
          </div>
          {err && <Callout tone="red" role="alert" className="mt-2">{err}</Callout>}
        </div>
      </Sheet>
    </>
  )
}
