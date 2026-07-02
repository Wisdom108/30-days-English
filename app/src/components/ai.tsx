import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, LogIn, LogOut, Mail, Send, X, Bot, Loader2 } from 'lucide-react'
import { useAuth } from '../auth'
import { features } from '../config'
import { signInWithEmail, signInWithGoogle, signOut } from '../lib/supabase'
import { aiChat, aiTutor, AIError, type ChatMsg, type LessonCtx } from '../lib/ai'
import { Button, Callout, IconButton } from './ui'
import { cn } from '../lib/utils'

// ============================================================================
// Login
// ============================================================================
export function LoginCard({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const sendLink = async () => {
    if (!email.includes('@')) return setError('请输入有效邮箱')
    setState('sending')
    setError(null)
    const { error } = await signInWithEmail(email.trim())
    if (error) {
      setError(error)
      setState('idle')
    } else {
      setState('sent')
    }
  }

  if (state === 'sent') {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface-2">
          <Mail size={20} className="text-fg" />
        </div>
        <h3 className="text-h2 font-semibold text-fg">登录链接已发送</h3>
        <p className="mt-1.5 text-sm text-fg-muted">
          去 <b className="text-fg">{email}</b> 邮箱点击链接即可登录。可关闭此窗口。
        </p>
        {onDone && (
          <Button variant="secondary" className="mt-4" onClick={onDone}>
            知道了
          </Button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-red" />
        <h3 className="text-h2 font-semibold text-fg">登录解锁 AI 功能</h3>
      </div>
      <p className="mt-1 text-sm text-fg-muted">对话陪练 · 写作批改 · 发音教练 · 私教答疑</p>

      <div className="mt-4 space-y-2.5">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="你的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendLink()}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-body text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <Button className="w-full" disabled={state === 'sending'} onClick={sendLink}>
          {state === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          发送登录链接
        </Button>
        <div className="flex items-center gap-2 py-0.5">
          <span className="h-px flex-1 bg-border" />
          <span className="text-label text-fg-dim">或</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="secondary" className="w-full" onClick={() => signInWithGoogle()}>
          <LogIn size={15} /> 用 Google 登录
        </Button>
      </div>
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
      <p className="mt-3 text-meta text-fg-dim">免登录也可用全部课程与基础语音；AI 功能需登录（有每日额度）。</p>
    </div>
  )
}

/** Sidebar auth widget: shows sign-in trigger or the signed-in email + sign-out. */
export function AuthControls({ onNavigate }: { onNavigate?: () => void }) {
  const { user, authEnabled } = useAuth()
  const [open, setOpen] = useState(false)
  if (!authEnabled) return null

  if (user) {
    return (
      <div className="flex items-center gap-2 px-2 text-sm">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-label font-semibold text-fg">
          {(user.email || '?')[0].toUpperCase()}
        </span>
        <span className="flex-1 truncate text-fg-secondary">{user.email}</span>
        <IconButton label="登出" size="sm" onClick={() => signOut()}>
          <LogOut size={14} />
        </IconButton>
      </div>
    )
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          onClick={onNavigate}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
        >
          <LogIn size={14} /> 登录 · 解锁 AI
        </button>
      </Dialog.Trigger>
      <LoginModal onClose={() => setOpen(false)} />
    </Dialog.Root>
  )
}

function LoginModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up">
        <Dialog.Title className="sr-only">登录</Dialog.Title>
        <LoginCard onDone={onClose} />
      </Dialog.Content>
    </Dialog.Portal>
  )
}

// ============================================================================
// AI gate — wrap any AI feature; shows the right prompt when unavailable
// ============================================================================
export function AiGate({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const { user, authEnabled } = useAuth()
  const [open, setOpen] = useState(false)

  if (!features.ai || !authEnabled) {
    return (
      <Callout tone="warning" icon={<Sparkles size={15} className="text-fg-muted" />}>
        AI 功能需配置后端（CF Worker + Supabase + Claude）后启用。见 SETUP.md。
      </Callout>
    )
  }
  if (!user) {
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Callout tone="accent" icon={<Sparkles size={15} className="text-red" />}>
          <div className={cn('flex items-center justify-between gap-3', compact && 'flex-col items-stretch')}>
            <span>登录后解锁 AI 功能</span>
            <Dialog.Trigger asChild>
              <Button size="sm">登录</Button>
            </Dialog.Trigger>
          </div>
        </Callout>
        <LoginModal onClose={() => setOpen(false)} />
      </Dialog.Root>
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
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = () => {
    const t = draft.trim()
    if (!t || busy) return
    setDraft('')
    onSend(t)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2.5 overflow-y-auto p-1">
        {messages.length === 0 && emptyHint && (
          <div className="py-6 text-center text-sm text-fg-muted">{emptyHint}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-body leading-relaxed',
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
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
              <Loader2 size={13} className="animate-spin" /> 思考中…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={placeholder}
          className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-body text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <Button size="icon" className="h-10 w-10 shrink-0" disabled={busy || !draft.trim()} onClick={send} aria-label="发送">
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
      {err && <p className="mt-1 text-meta text-danger">{err}</p>}
    </div>
  )
}

// ============================================================================
// Floating private tutor (私教答疑) — mounted globally, context = current day
// ============================================================================
export function TutorFab({ lesson, hidden }: { lesson: LessonCtx; hidden?: boolean }) {
  const { authEnabled } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!features.ai || !authEnabled || hidden) return null

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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          aria-label="问 AI 私教"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border border-border-strong bg-elevated text-fg shadow-[var(--shadow-popover)] transition-transform hover:-translate-y-0.5 active:scale-95 md:bottom-6 md:right-6"
        >
          <Bot size={20} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in-up" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col rounded-t-xl border border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-popover)] focus:outline-none data-[state=open]:animate-in-up md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[420px] md:rounded-none md:border-l">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-h2 font-semibold text-fg">
              <Bot size={17} /> AI 私教
              {lesson.day ? <span className="label-nd">Day {lesson.day}</span> : null}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="关闭"><X size={16} /></IconButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread
              messages={messages}
              busy={busy}
              onSend={ask}
              placeholder="问语法、用法、为什么这么说…"
              emptyHint="随时问我英语问题 —— 我会用中文讲清楚，配上英文例句，结合今天的课。"
            />
          </div>
          {err && <p className="mt-1 text-meta text-danger">{err}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
