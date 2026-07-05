import { useEffect, useRef, useState } from 'react'
import { Loader2, Volume2, MicOff, PhoneCall, Square, Zap } from 'lucide-react'
import { startGrok, type GrokSession, type GrokStatus } from '../lib/grokRealtime'
import type { LessonCtx } from '../lib/ai'
import { getWallet, walletCap } from '../lib/zaizai'
import { useAuth } from '../auth'
import { AiGate } from './ai'
import { openPlans } from './zaizai/PlanSheet'
import { Button, Callout } from './ui'
import { useToast } from './ui/toast'
import { cn } from '../lib/utils'

// xAI Grok NATIVE realtime voice — true speech-to-speech (continuous, interrupt
// mid-word). Paid (needs the Worker's XAI_API_KEY). Same UI shell as the free
// CF tutor, driven by the Grok WebSocket/PCM engine.
type Turn = { role: 'user' | 'ai'; text: string }

// Character presets (mirror the Worker's PERSONAS). Picking one changes the
// tutor's voice AND personality, so it feels like a distinct real person.
const CHARACTERS = [
  { key: 'emma', name: 'Emma', blurb: '温柔 · 会聊天的朋友' },
  { key: 'aria', name: 'Aria', blurb: '元气 · 爱笑的搭子' },
  { key: 'sam', name: 'Sam', blurb: '随和 · 毒舌哥们儿' },
  { key: 'rex', name: 'Rex', blurb: '好奇 · 爱讲故事' },
  { key: 'leo', name: 'Leo', blurb: '热血 · 应援担当' },
] as const

// Badge-gated voices. Locks only bite when we POSITIVELY know the badges
// (wallet cap on + real account + wallet fetched) — guests / fetch failures
// stay unlocked rather than punishing users we can't verify.
const VOICE_LOCKS: Record<string, { badge: string; hint: string }> = {
  rex: { badge: 'streak_7', hint: '连续学习 7 天,拿到「七日不断」徽章解锁' },
  leo: { badge: 'scenario_3', hint: '完成 3 次场景演练,拿到「场景新手」徽章解锁' },
}

export default function GrokLiveTutor({ lesson, scenario }: { lesson: LessonCtx; scenario?: string }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState<'idle' | GrokStatus>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [persona, setPersona] = useState<string>('emma')
  const [badges, setBadges] = useState<string[] | null>(null) // null = unknown → no locks
  const sessionRef = useRef<GrokSession | null>(null)
  // Session generation: bumped on hang-up / redial / unmount so callbacks from a
  // defunct session are ignored (e.g. the ws close event that arrives AFTER a
  // manual hang-up must not overwrite 'idle' with 'closed').
  const genRef = useRef(0)
  const dead = useRef(false) // set on unmount — a connect that resolves late must not orphan its session
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { dead.current = true; genRef.current++; sessionRef.current?.stop() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, status])

  useEffect(() => {
    if (!walletCap() || !user?.account) return
    let alive = true
    getWallet().then((w) => {
      if (!alive || !w) return
      setBadges(w.badges)
      // deselect a voice that turns out locked (picked before badges arrived)
      setPersona((p) => { const l = VOICE_LOCKS[p]; return l && !w.badges.includes(l.badge) ? 'emma' : p })
    })
    return () => { alive = false }
  }, [user?.account])

  const lockOf = (key: string) => {
    const lock = VOICE_LOCKS[key]
    return lock && badges !== null && !badges.includes(lock.badge) ? lock : null
  }

  const start = async () => {
    // Supersede + kill any previous session BEFORE dialing: after a remote drop
    // the old session may still hold the mic, and each redial without stopping
    // it leaks 2 AudioContexts (iOS caps ~4 → later calls go silent).
    const gen = ++genRef.current
    sessionRef.current?.stop()
    sessionRef.current = null
    setError(null)
    setConnecting(true)
    try {
      const s = await startGrok({
        lesson,
        persona,
        scenario,
        onStatus: (st) => {
          if (genRef.current !== gen) return // defunct session (hung up / redialed)
          if (st === 'closed') {
            // Remote disconnect (a local stop() bumps gen first, so it never
            // lands here): session tore itself down — put the UI back to idle
            // so the orb redials and the character picker returns.
            sessionRef.current = null
            setStatus('idle')
            toast({ title: '通话已断开' })
          } else {
            setStatus(st)
          }
        },
        onUserText: (t) => { if (genRef.current === gen && t) setTurns((prev) => upsert(prev, 'user', t)) },
        onAiText: (t, _done) => { if (genRef.current === gen && t) setTurns((prev) => upsert(prev, 'ai', t)) },
        onError: (m) => { if (genRef.current === gen) setError(m) },
      })
      if (dead.current || genRef.current !== gen) { s.stop(); return } // dismissed or hung up mid-connect
      sessionRef.current = s
      if (s.walletSpent) toast({ title: '本次通话已花费 5 分钟通话时长' })
    } catch (e) {
      if (genRef.current === gen) {
        setError(e instanceof Error ? e.message : '连接失败，请重试')
        setStatus('idle')
      }
    } finally {
      setConnecting(false)
    }
  }

  const stop = () => {
    genRef.current++ // discard late callbacks (e.g. the async ws close event) from this session
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

        {/* character picker — choose who you talk to (before the call) */}
        {status === 'idle' && (
          <div className="mb-4 w-full">
            <div className="label-nd mb-2 text-center">选个搭档</div>
            <div className="flex flex-wrap justify-center gap-2">
              {CHARACTERS.map((c) => {
                const lock = lockOf(c.key)
                return (
                  <button
                    key={c.key}
                    onClick={() => {
                      if (lock) return toast({ title: `${c.name} 还没解锁`, description: lock.hint })
                      setPersona(c.key)
                    }}
                    className={cn(
                      'press rounded-full border px-3 py-1.5 text-sm transition-colors',
                      persona === c.key ? 'border-fg bg-elevated text-fg' : 'border-border text-fg-muted hover:text-fg',
                      lock && 'opacity-40',
                    )}
                  >
                    {lock && <span className="mr-1">🔒</span>}
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-1.5 text-meta text-fg-dim">{c.blurb}</span>
                  </button>
                )
              })}
            </div>
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

        {error && (
          <Callout tone="red" role="alert" className="mt-4 w-full text-left">
            {error.includes('额度不足') ? (
              // 钱包/免费额度都花完的 429 —— 指路方案对比,而不是甩一行报错 (§8.4)
              <div className="flex items-center justify-between gap-3">
                <span>通话额度不足 —— 学习可赚,会员畅聊。</span>
                <Button size="sm" variant="secondary" className="shrink-0" onClick={openPlans}>查看方案</Button>
              </div>
            ) : (
              error
            )}
          </Callout>
        )}
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
