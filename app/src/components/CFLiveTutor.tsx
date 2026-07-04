import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, Volume2, PhoneCall, MicOff } from 'lucide-react'
import { VoiceClient } from '@cloudflare/voice/client'
import type { LessonCtx } from '../lib/ai'
import { AiGate } from './ai'
import { Callout } from './ui'
import { cn } from '../lib/utils'

// Realtime voice tutor, 100% on Cloudflare (Workers AI STT+LLM+TTS via the
// Agents SDK voice pipeline) — no external key. Streams audio over a WebSocket
// to the VoiceTutor Durable Object; supports barge-in (talk over the tutor).
type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type Turn = { role: string; text: string }

export default function CFLiveTutor({ lesson: _lesson }: { lesson: LessonCtx }) {
  const [status, setStatus] = useState<Status>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [interim, setInterim] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const clientRef = useRef<VoiceClient | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { clientRef.current?.endCall(); clientRef.current?.disconnect() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, interim, status])

  const start = async () => {
    setError(null)
    setConnecting(true)
    try {
      const client = new VoiceClient({ agent: 'voice-tutor', host: window.location.host })
      clientRef.current = client
      client.addEventListener('statuschange', (s) => setStatus(s as Status))
      client.addEventListener('transcriptchange', (t) => setTurns(t as Turn[]))
      client.addEventListener('interimtranscript', (t) => setInterim(t))
      client.addEventListener('mutechange', (m) => setMuted(m))
      client.addEventListener('error', (e) => e && setError(String(e)))
      client.connect()
      // connect() is fire-and-forget: the WebSocket opens asynchronously and
      // startCall() bails with "Cannot start call: not connected" if the socket
      // isn't OPEN yet. Wait for connectionchange(true) before starting.
      await new Promise<void>((resolve, reject) => {
        if (client.connected) return resolve()
        const onConn = (ok: boolean) => {
          if (!ok) return
          clearTimeout(timer)
          client.removeEventListener('connectionchange', onConn)
          resolve()
        }
        const timer = setTimeout(() => {
          client.removeEventListener('connectionchange', onConn)
          reject(new Error('连接超时，请重试'))
        }, 10000)
        client.addEventListener('connectionchange', onConn)
      })
      await client.startCall()
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请重试')
    } finally {
      setConnecting(false)
    }
  }

  const stop = () => {
    clientRef.current?.endCall()
    clientRef.current?.disconnect()
    clientRef.current = null
    setStatus('idle')
    setInterim(null)
  }

  const live = status !== 'idle'
  const hint =
    connecting ? '连接中…'
    : status === 'listening' ? '在听你说… 直接开口'
    : status === 'thinking' ? 'AI 思考中…'
    : status === 'speaking' ? 'AI 在说 · 可以随时插话打断'
    : turns.length ? '继续说，或结束对话' : '点一下,用英文和 AI 老师实时对话'

  return (
    <AiGate compact>
      <div className="flex flex-col items-center">
        {/* transcript */}
        {(turns.length > 0 || interim) && (
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
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg border border-border bg-surface-2 px-3 py-2 text-body italic text-fg-secondary">{interim}</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {/* orb */}
        <div className="relative my-2 h-24 w-24">
          {(status === 'listening' || status === 'speaking') && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={live ? stop : start}
            disabled={connecting}
            aria-label={live ? '结束对话' : '开始对话'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60',
              status === 'listening' ? 'border-red bg-red-soft text-red'
                : status === 'thinking' ? 'border-border-strong bg-surface text-fg-muted'
                : status === 'speaking' ? 'border-fg bg-surface text-fg'
                : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {connecting ? <Loader2 size={28} className="animate-spin" />
              : status === 'listening' ? <Mic size={30} />
              : status === 'thinking' ? <Loader2 size={28} className="animate-spin" />
              : status === 'speaking' ? <span className="wave-anim flex h-6 items-center gap-[3px]">{[10, 18, 12].map((h, i) => <i key={i} className="w-[3px] rounded-full bg-current" style={{ height: h, animationDelay: `${i * 90}ms` }} />)}</span>
              : <PhoneCall size={28} />}
          </button>
        </div>
        <div className="label-nd mt-1 text-center">{hint}</div>

        {/* controls while live */}
        {live && (
          <div className="mt-4 flex items-center gap-2.5">
            <button onClick={() => clientRef.current?.toggleMute()} className={cn('press inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors', muted ? 'border-red text-red' : 'border-border text-fg-secondary hover:text-fg')}>
              {muted ? <><MicOff size={14} /> 已静音</> : <><Volume2 size={14} /> 静音</>}
            </button>
            <button onClick={stop} className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-red bg-red-soft px-3 text-sm text-red">
              <Square size={13} /> 结束对话
            </button>
          </div>
        )}

        {error && <Callout tone="red" role="alert" className="mt-4 w-full text-left">{error}</Callout>}
        <p className="mt-4 text-center text-meta text-fg-dim">全程 Cloudflare Workers AI · 免费 · 可随时打断</p>
      </div>
    </AiGate>
  )
}
