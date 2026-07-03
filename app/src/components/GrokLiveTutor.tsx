import { useEffect, useRef, useState } from 'react'
import { Loader2, Volume2, MicOff, PhoneCall, Square, Zap } from 'lucide-react'
import { startGrok, type GrokSession, type GrokStatus } from '../lib/grokRealtime'
import type { LessonCtx } from '../lib/ai'
import { AiGate } from './ai'
import { Callout } from './ui'
import { cn } from '../lib/utils'

// xAI Grok NATIVE realtime voice — true speech-to-speech (continuous, interrupt
// mid-word). Paid (needs the Worker's XAI_API_KEY). Same UI shell as the free
// CF tutor, driven by the Grok WebSocket/PCM engine.
type Turn = { role: 'user' | 'ai'; text: string }

export default function GrokLiveTutor({ lesson }: { lesson: LessonCtx }) {
  const [status, setStatus] = useState<'idle' | GrokStatus>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const sessionRef = useRef<GrokSession | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => sessionRef.current?.stop(), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, status])

  const start = async () => {
    setError(null)
    setConnecting(true)
    try {
      sessionRef.current = await startGrok({
        lesson,
        onStatus: (s) => setStatus(s),
        onUserText: (t) => t && setTurns((prev) => upsert(prev, 'user', t)),
        onAiText: (t, _done) => t && setTurns((prev) => upsert(prev, 'ai', t)),
        onError: (m) => setError(m),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请重试')
      setStatus('idle')
    } finally {
      setConnecting(false)
    }
  }

  const stop = () => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setStatus('idle')
  }

  const live = status !== 'idle' && status !== 'closed'
  const hint =
    connecting ? '连接中…'
    : status === 'speaking' ? 'AI 在说 · 可随时插话打断'
    : status === 'listening' ? '在听你说… 直接开口'
    : turns.length ? '继续说，或结束对话' : '点一下,和 Grok 实时语音对话'

  return (
    <AiGate compact>
      <div className="flex flex-col items-center">
        {turns.length > 0 && (
          <div className="mb-4 w-full space-y-2.5">
            {turns.map((m, i) => (
              <div key={i} className={cn('animate-in-up flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-body leading-relaxed',
                  m.role === 'user' ? 'bg-brand text-brand-fg' : 'border border-border bg-surface-2 text-fg',
                )}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        <div className="relative my-2 h-24 w-24">
          {live && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={live ? stop : start}
            disabled={connecting}
            aria-label={live ? '结束对话' : '开始对话'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60',
              status === 'listening' ? 'border-red bg-red-soft text-red'
                : status === 'speaking' ? 'border-fg bg-surface text-fg'
                : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {connecting ? <Loader2 size={28} className="animate-spin" />
              : status === 'speaking' ? <span className="wave-anim flex h-6 items-center gap-[3px]">{[10, 18, 12].map((h, i) => <i key={i} className="w-[3px] rounded-full bg-current" style={{ height: h, animationDelay: `${i * 90}ms` }} />)}</span>
              : <PhoneCall size={28} />}
          </button>
        </div>
        <div className="label-nd mt-1 flex items-center gap-1.5"><Zap size={11} /> {hint}</div>

        {live && (
          <div className="mt-4 flex items-center gap-2.5">
            <button onClick={() => { const m = !muted; setMuted(m); sessionRef.current?.mute(m) }} className={cn('press inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors', muted ? 'border-red text-red' : 'border-border text-fg-secondary hover:text-fg')}>
              {muted ? <><MicOff size={14} /> 已静音</> : <><Volume2 size={14} /> 静音</>}
            </button>
            <button onClick={stop} className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-red bg-red-soft px-3 text-sm text-red">
              <Square size={13} /> 结束对话
            </button>
          </div>
        )}

        {error && <Callout tone="red" role="alert" className="mt-4 w-full text-left">{error}</Callout>}
        <p className="mt-4 text-center text-meta text-fg-dim">Grok 原生实时语音 · 连续对话 · 可打断</p>
      </div>
    </AiGate>
  )
}

// Keep one growing bubble per speaker turn: same-role consecutive updates replace
// the last bubble (streaming transcript), a role switch starts a new one.
function upsert(prev: Turn[], role: 'user' | 'ai', text: string): Turn[] {
  const last = prev[prev.length - 1]
  if (last && last.role === role) return [...prev.slice(0, -1), { role, text }]
  return [...prev, { role, text }]
}
