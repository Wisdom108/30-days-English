import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2, Volume2 } from 'lucide-react'
import { cfVoiceAvailable, cfRecordAndTranscribe, cfSpeak, stopCfSpeak, stopCfRecording } from '../lib/cfSpeech'
import { aiChat, AIError, type ChatMsg, type LessonCtx } from '../lib/ai'
import { AiGate } from './ai'
import { Callout } from './ui'
import { cn } from '../lib/utils'

// Free voice-conversation loop (no OpenAI key): hold-free tap-to-talk →
// Whisper transcribes → Llama replies → Aura speaks it back. Turn-based (a few
// seconds/turn) but a real spoken conversation on the free CF stack. When the
// OpenAI Realtime key is set, SpeakingBlock uses LiveTutor instead (sub-second).

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

export default function VoiceLoop({ lesson, scenario }: { lesson: LessonCtx; scenario?: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [turns, setTurns] = useState<ChatMsg[]>([])
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; stopCfSpeak() }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, phase])

  if (!cfVoiceAvailable()) {
    return <Callout tone="warning">语音对话需要后端语音服务，当前不可用。</Callout>
  }

  const turn = async () => {
    // Tapping mid-turn stops it.
    if (phase === 'listening') { stopCfRecording(); return }
    if (phase === 'speaking') { stopCfSpeak(); setPhase('idle'); return }
    if (phase === 'thinking') return

    setError(null)
    setPhase('listening')
    let heard = ''
    try {
      heard = (await cfRecordAndTranscribe()).trim()
    } catch (e) {
      if (!aliveRef.current) return
      setPhase('idle')
      setError(e instanceof Error && e.message === 'no-speech' ? '没听清，再说一次试试～' : '录音失败，请检查麦克风权限')
      return
    }
    if (!aliveRef.current) return
    if (!heard) { setPhase('idle'); return }

    const next: ChatMsg[] = [...turns, { role: 'user', content: heard }]
    setTurns(next)
    setPhase('thinking')
    try {
      const { reply } = await aiChat(next, lesson, scenario)
      if (!aliveRef.current) return
      setTurns((m) => [...m, { role: 'assistant', content: reply }])
      setPhase('speaking')
      await cfSpeak(reply)
    } catch (e) {
      if (!aliveRef.current) return
      setError(e instanceof AIError ? e.message : 'AI 暂时不可用，请重试')
    } finally {
      if (aliveRef.current) setPhase('idle')
    }
  }

  const hint =
    phase === 'listening' ? '听着… 点一下结束'
    : phase === 'thinking' ? 'AI 思考中…'
    : phase === 'speaking' ? 'AI 正在回答 · 点一下打断'
    : turns.length ? '点麦克风继续说' : '点麦克风，用英文开口说'

  return (
    <AiGate compact>
      <div className="flex flex-col items-center">
        {/* transcript */}
        {turns.length > 0 && (
          <div className="mb-4 w-full space-y-2.5">
            {turns.map((m, i) => (
              <div key={i} className={cn('animate-in-up flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-body leading-relaxed',
                  m.role === 'user' ? 'bg-brand text-brand-fg' : 'border border-border bg-surface-2 text-fg',
                )}>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {/* mic orb */}
        <div className="relative my-2 h-24 w-24">
          {(phase === 'listening' || phase === 'speaking') && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={turn}
            aria-label={phase === 'idle' ? '开始说话' : '停止'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              phase === 'listening' ? 'border-red bg-red-soft text-red'
                : phase === 'thinking' ? 'border-border-strong bg-surface text-fg-muted'
                : phase === 'speaking' ? 'border-fg bg-surface text-fg'
                : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {phase === 'listening' ? <Square size={26} />
              : phase === 'thinking' ? <Loader2 size={28} className="animate-spin" />
              : phase === 'speaking' ? <Volume2 size={28} />
              : <Mic size={30} />}
          </button>
        </div>
        <div className="label-nd mt-1">{hint}</div>
        {error && <Callout tone="red" role="alert" className="mt-4 w-full text-left">{error}</Callout>}
      </div>
    </AiGate>
  )
}
