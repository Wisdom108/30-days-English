import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Sparkles, LogIn, LogOut, Send, X, Bot, Loader2 } from 'lucide-react'
import { useAuth } from '../auth'
import { features } from '../config'
import { login, logout } from '../lib/access'
import { aiChat, aiTutor, AIError, type ChatMsg, type LessonCtx } from '../lib/ai'
import { Button, Callout, IconButton } from './ui'
import { cn } from '../lib/utils'

// ============================================================================
// Login (Cloudflare Access — hosted email OTP + Google/GitHub, redirect flow)
// ============================================================================

/** Sidebar auth widget: signed-in email + sign-out, or a sign-in trigger. */
export function AuthControls() {
  const { user, authEnabled, loading } = useAuth()
  if (!authEnabled) return null
  // Open mode (no Cloudflare Access): identity is the anonymous "访客" — no login UI.
  if (user?.email === '访客') return null
  if (loading) return <div className="mx-2 h-6 animate-pulse rounded-md bg-hover" />

  if (user) {
    return (
      <div className="flex items-center gap-2 px-2 text-sm">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-label font-semibold text-fg">
          {(user.email || '?')[0].toUpperCase()}
        </span>
        <span className="flex-1 truncate text-fg-secondary">{user.email}</span>
        <IconButton label="登出" size="sm" onClick={logout}>
          <LogOut size={14} />
        </IconButton>
      </div>
    )
  }
  return (
    <button
      onClick={login}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
    >
      <LogIn size={14} /> 登录 · 解锁 AI
    </button>
  )
}

// ============================================================================
// AI gate — wrap any AI feature; shows the right prompt when unavailable
// ============================================================================
export function AiGate({ children, compact }: { children: ReactNode; compact?: boolean }) {
  const { user, authEnabled, loading } = useAuth()

  if (!features.ai || !authEnabled) {
    return (
      <Callout tone="warning" icon={<Sparkles size={15} className="text-fg-muted" />}>
        AI 功能需配置后端（CF Worker + Cloudflare Access + Claude）后启用。见 SETUP.md。
      </Callout>
    )
  }
  // Avoid flashing the "登录后解锁" prompt while the session is still resolving.
  if (loading) {
    return <div className="h-9 animate-pulse rounded-lg bg-hover" />
  }
  if (!user) {
    return (
      <Callout tone="accent" icon={<Sparkles size={15} className="text-red" />}>
        <div className={cn('flex items-center justify-between gap-3', compact && 'flex-col items-stretch')}>
          <span>登录后解锁 · 对话陪练 / 写作批改 / 发音教练 / 私教答疑</span>
          <Button size="sm" onClick={login}>登录</Button>
        </div>
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
  const { user, authEnabled } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Only for signed-in users — signed-out access is via the sidebar login entry.
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
