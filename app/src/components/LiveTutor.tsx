import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react'
import type { LessonCtx } from '../lib/ai'
import { realtimeAvailable } from '../lib/caps'
import { startRealtime, type RtSession, type RtStatus } from '../lib/realtime'
import { AiGate } from './ai'
import { Button, Callout } from './ui'
import { cn } from '../lib/utils'

// Live VOICE conversation with the AI tutor (OpenAI Realtime over WebRTC).
// Self-contained: shows a start orb, then a live transcript + call controls.
// The WebRTC engine lives in lib/realtime.ts; this only renders its callbacks.

type Status = 'idle' | RtStatus
type Turn = { role: 'user' | 'ai'; text: string }

const STATUS_LINE: Record<RtStatus, string> = {
  connecting: '连接中…',
  listening: '在听你说…',
  speaking: 'AI 在说…',
  closed: '已结束',
}

function LiveTutorInner({ lesson }: { lesson: LessonCtx }) {
  const [status, setStatus] = useState<Status>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const sessionRef = useRef<RtSession | null>(null)
  const aiOpenRef = useRef(false) // is the tutor's current turn still streaming?
  const endRef = useRef<HTMLDivElement>(null)

  // keep the newest turn in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, status])

  // hard stop on unmount (e.g. navigating away mid-call)
  useEffect(() => () => sessionRef.current?.stop(), [])

  // Tutor transcript: update the open ai turn, or start a new one.
  const onAiText = (text: string, done: boolean) => {
    setTurns((prev) => {
      if (aiOpenRef.current && prev.length && prev[prev.length - 1].role === 'ai') {
        const next = prev.slice()
        next[next.length - 1] = { role: 'ai', text }
        return next
      }
      return [...prev, { role: 'ai', text }]
    })
    aiOpenRef.current = !done
  }

  const onUserText = (text: string) => {
    if (!text) return
    setTurns((prev) => [...prev, { role: 'user', text }])
  }

  const start = async () => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setError(null)
    setTurns([])
    setMuted(false)
    aiOpenRef.current = false
    setStatus('connecting')
    try {
      sessionRef.current = await startRealtime({
        lesson,
        onStatus: (s) => setStatus(s),
        onUserText,
        onAiText,
        onError: (m) => setError(m),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败')
      setStatus('idle')
    }
  }

  const stop = () => {
    sessionRef.current?.stop()
    sessionRef.current = null
    aiOpenRef.current = false
    setMuted(false)
    setStatus('idle')
  }

  const toggleMute = () => {
    const m = !muted
    setMuted(m)
    sessionRef.current?.mute(m)
  }

  const live = status === 'connecting' || status === 'listening' || status === 'speaking'

  // ---- idle / closed: the start orb ----
  if (!live) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <div className="relative my-2 h-28 w-28">
          <button
            onClick={start}
            aria-label="开始对话"
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border-2 border-border-strong bg-surface text-fg transition-colors hover:border-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            )}
          >
            <PhoneCall size={34} />
          </button>
        </div>
        <div className="label-nd mt-4">开始对话</div>
        <p className="mt-2 max-w-[260px] text-sm text-fg-muted">和 AI 老师用英文实时对话 · 它会边听边纠正</p>
        {error && (
          <Callout tone="red" role="alert" className="mt-4 w-full text-left">
            {error}
          </Callout>
        )}
      </div>
    )
  }

  // ---- live: status line + transcript + call controls ----
  return (
    <div className="flex flex-col p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              status === 'listening' ? 'pulse-red bg-red' : status === 'speaking' ? 'bg-fg' : 'bg-fg-muted',
            )}
          />
          <span className="label-nd truncate">{STATUS_LINE[status]}</span>
          {status === 'speaking' && (
            <span className="wave-anim flex h-3.5 items-center gap-[2.5px] text-fg">
              {[6, 12, 8, 11].map((h, i) => (
                <i key={i} className="w-[2.5px] rounded-full bg-current" style={{ height: h, animationDelay: `${i * 90}ms` }} />
              ))}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={toggleMute} aria-pressed={muted}>
            {muted ? <MicOff size={14} /> : <Mic size={14} />}
            {muted ? '已静音' : '静音'}
          </Button>
          <Button variant="danger" size="sm" onClick={stop}>
            <PhoneOff size={14} /> 结束对话
          </Button>
        </div>
      </div>

      <div className="mt-3 h-[min(320px,45dvh)] space-y-2.5 overflow-y-auto p-1" role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className="py-8 text-center text-sm text-fg-muted">开口说英语吧，AI 老师在听…</div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn('animate-in-up flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-body leading-relaxed',
                t.role === 'user' ? 'bg-brand text-brand-fg' : 'border border-border bg-surface-2 text-fg',
              )}
            >
              {t.text || '…'}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <Callout tone="red" role="alert" className="mt-2">
          {error}
        </Callout>
      )}
    </div>
  )
}

export default function LiveTutor({ lesson }: { lesson: LessonCtx }) {
  if (!realtimeAvailable()) {
    return (
      <div className="p-4">
        <Callout tone="warning">实时语音对话需在后端配置 OpenAI 密钥后启用（见 SETUP.md）</Callout>
      </div>
    )
  }
  // Signed-out users get the login prompt first.
  return (
    <AiGate>
      <LiveTutorInner lesson={lesson} />
    </AiGate>
  )
}
