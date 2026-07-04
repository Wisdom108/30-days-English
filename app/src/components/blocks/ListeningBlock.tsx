import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Check } from 'lucide-react'
import type { DayLesson } from '../../types'
import { prefetchSpeak, speak, stopSpeaking, type VoiceKey } from '../../lib/speech'
import { QAItem, RowGroup, BlockHead, SpeakButton } from '../shared'
import { Button, Collapse, Stepper } from '../ui'
import { cn } from '../../lib/utils'

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9']/g, '')

// Split the transcript into focused lines so the hero shows ONE sentence at a
// time instead of a wall of text.
function toSentences(script: string): string[] {
  const parts = script.match(/[^.!?]+[.!?]+["'”’]?/g)
  return (parts && parts.length ? parts : [script]).map((s) => s.trim()).filter(Boolean)
}

// Decorative waveform — animates only while audio plays.
function Waveform({ playing }: { playing: boolean }) {
  const bars = [8, 15, 22, 12, 19, 9, 16, 7, 13, 6, 18, 10]
  return (
    <div className={cn('flex h-6 items-center justify-center gap-[3px]', playing && 'wave-anim')}>
      {bars.map((h, i) => (
        <i
          key={i}
          className={cn('w-[3px] rounded-full', playing ? 'bg-fg' : 'bg-border-strong')}
          style={{ height: h, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  )
}

export default function ListeningBlock({ lesson }: { lesson: DayLesson }) {
  const l = lesson.listening
  const sentences = toSentences(l.script)
  const [playing, setPlaying] = useState(false)
  const [si, setSi] = useState(0)
  const [slow, setSlow] = useState(false)
  const rate = slow ? 0.7 : 1
  const playingRef = useRef(false)

  // Dialogue scripts are "A: …\nB: …". Carry the speaker across the sentence
  // splits (only the turn's first sentence keeps the prefix) so each line plays
  // in that speaker's voice, with the "A:"/"B:" stripped from display + TTS.
  const speakersSeen: string[] = []
  let carry: string | null = null
  const meta = sentences.map((s) => {
    const m = s.match(/^\s*([A-Za-z])\s*[:：]\s*([\s\S]*)$/)
    if (m) { carry = m[1].toUpperCase(); if (!speakersSeen.includes(carry)) speakersSeen.push(carry) }
    const key: VoiceKey | undefined = carry ? (speakersSeen.indexOf(carry) % 2 === 0 ? 'a' : 'b') : undefined
    return { speaker: carry, clean: (m ? m[2] : s).trim(), key }
  })
  const isDialogue = speakersSeen.length >= 2
  const curText = meta[si]?.clean ?? l.script
  const curKey = meta[si]?.key
  const curSpeaker = meta[si]?.speaker

  // Warm the current sentence's audio as it appears — replay taps are instant.
  useEffect(() => { prefetchSpeak(curText) }, [curText])

  const [di, setDi] = useState(0)
  const [ans, setAns] = useState('')
  const [result, setResult] = useState<null | 'ok' | 'bad'>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const stopPlay = () => { playingRef.current = false; stopSpeaking(); setPlaying(false) }

  // Stop narration when the block unmounts (leaving 精听) so it can't keep reading
  // over the next screen, and a re-entry can't spawn a dueling second loop.
  useEffect(() => () => { playingRef.current = false; stopSpeaking() }, [])

  // The orb reads sequentially FROM the current sentence — display always
  // matches audio, the dots advance as it plays. Tap again to stop.
  const playAll = async () => {
    if (playingRef.current) { stopPlay(); return }
    playingRef.current = true
    setPlaying(true)
    for (let i = si; i < sentences.length && playingRef.current; i++) {
      setSi(i)
      if (i + 1 < sentences.length) prefetchSpeak(meta[i + 1].clean) // warm the next line
      await speak(meta[i].clean, rate, undefined, meta[i].key) // A/B voice
    }
    playingRef.current = false
    setPlaying(false)
  }
  // Stepping / word-tapping is a manual choice → stop auto-play first so the
  // loop doesn't override the user's sentence or skip ahead.
  const step = (d: number) => { if (playingRef.current) stopPlay(); setSi((p) => Math.min(Math.max(p + d, 0), sentences.length - 1)) }
  const sayWord = (w: string) => { if (playingRef.current) stopPlay(); speak(w, rate, undefined, curKey) }

  const dict = l.dictation[di]
  const total = l.dictation.length
  const dictDone = di >= total
  const parts = dict ? dict.sentence.split('____') : ['', '']
  // Empty input counts as "don't know" → reveals the answer (never a dead tap).
  const check = () => setResult(ans.trim() && norm(ans) === norm(dict.answer) ? 'ok' : 'bad')
  const next = () => { setDi((n) => n + 1); setAns(''); setResult(null) }

  // Keep keyboard focus in the input across items (the card is no longer keyed,
  // which used to eject focus on every advance).
  useEffect(() => { if (!dictDone) inputRef.current?.focus() }, [di, dictDone])

  // tappable words in the current sentence (prefix stripped)
  const words = curText.split(/(\s+)/)

  return (
    <div className="space-y-4">
      {/* ===== HERO — audio orb is the star; transcript steps one line at a time ===== */}
      <div className="hero-card overflow-hidden rounded-xl border border-border-strong">
        <BlockHead tag="精听" title={l.title} />

        <div className="px-6 pb-7 pt-6 text-center">
          {/* big play orb — plays from the current sentence onward */}
          <div className="relative mx-auto h-28 w-28">
            {playing && <span className="pulse-red absolute -inset-2.5 rounded-full border border-fg/15" />}
            <span className="absolute inset-0 rounded-full border-2 border-border-strong" />
            <button
              onClick={playAll}
              aria-label={playing ? '停止' : '从本句播放'}
              className="press absolute inset-3.5 grid place-items-center rounded-full bg-brand text-brand-fg shadow-[0_8px_30px_-8px_rgba(10,124,255,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {playing ? <Pause size={30} /> : <Play size={30} className="translate-x-0.5" fill="currentColor" />}
            </button>
          </div>

          <div className="mt-5"><Waveform playing={playing} /></div>

          {/* current sentence — LARGEST thing on screen, tap a word to hear it */}
          <p key={si} className="animate-in-up mt-5 px-1 text-left">
            {isDialogue && curSpeaker && (
              <span className={cn('mb-2 inline-grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold', curKey === 'a' ? 'bg-fg text-bg' : 'bg-red-deep text-white')}>
                {curSpeaker}
              </span>
            )}
            <span className="block text-h1 font-semibold leading-[1.5] text-fg">
              {words.map((w, i) => {
                if (/^\s+$/.test(w)) return w
                const clean = w.replace(/[^A-Za-z'-]/g, '')
                return (
                  <span
                    key={i}
                    onClick={() => clean && sayWord(clean)}
                    className="cursor-pointer rounded px-0.5 transition-colors hover:bg-accent-soft active:bg-accent-soft"
                  >
                    {w}
                  </span>
                )
              })}
            </span>
          </p>

          {/* sentence stepper + slow toggle */}
          <div className={cn('mt-5 flex items-center gap-2', sentences.length === 1 && 'justify-center')}>
            {sentences.length > 1 && <Stepper idx={si} total={sentences.length} onStep={step} className="min-w-0 flex-1" />}
            <button
              onClick={() => setSlow((v) => !v)}
              aria-pressed={slow}
              aria-label="慢速 0.7 倍"
              className={cn(
                'press h-10 shrink-0 rounded-lg border px-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                slow ? 'border-fg text-fg' : 'border-border text-fg-muted hover:text-fg',
              )}
            >
              0.7×
            </button>
          </div>
        </div>
      </div>

      {/* ===== DICTATION — one sentence at a time ===== */}
      <div>
        <div className="mb-3"><span className="label-nd">听写</span></div>

        {dictDone ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-fg text-bg"><Check size={18} strokeWidth={3} /></span>
            <div className="text-sm text-fg-secondary">听写完成 · 共 <span className="t-tab">{total}</span> 句</div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setDi(0); setAns(''); setResult(null) }}>重做</Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-5">
            {/* only the prompt line animates per item — the input stays mounted so
                focus survives the check→next Enter flow */}
            <div key={di} className="animate-in-up text-[19px] leading-[1.7] text-fg">
              {parts[0]}
              <span className={cn(
                'mx-1 inline-block min-w-[92px] border-b-2 text-center font-semibold',
                result === 'ok' ? 'animate-slam border-fg text-fg' : result === 'bad' ? 'border-red text-red' : 'border-border-strong text-fg',
              )}>
                {result === 'bad' ? dict.answer : ans || ' '}
              </span>
              {parts[1]}
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <SpeakButton text={dict.sentence.replace('____', dict.answer)} />
              <input
                ref={inputRef}
                value={ans}
                onChange={(e) => { setAns(e.target.value); setResult(null) }}
                onKeyDown={(e) => { if (e.key !== 'Enter') return; result !== null ? next() : check() }}
                placeholder="听到的词…"
                aria-label={`听写填空 第 ${di + 1} 题`}
                className="h-12 flex-1 rounded-xl border border-border-strong bg-surface-2 px-4 text-body-lg text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {result === 'bad' && <p className="mt-2.5 text-sm text-fg-muted">正确答案：<span className="text-fg">{dict.answer}</span></p>}

            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1.5">
                {l.dictation.map((_, i) => (
                  <span key={i} className={cn('h-1.5 w-1.5 rounded-[2px]', i < di ? 'bg-fg' : i === di ? 'bg-red' : 'border border-border-strong')} />
                ))}
              </div>
              {result === 'ok' ? (
                <Button size="sm" onClick={next}>下一句 →</Button>
              ) : result === 'bad' ? (
                <Button variant="secondary" size="sm" onClick={next}>知道了 · 下一句</Button>
              ) : (
                <Button size="sm" onClick={check}>{ans.trim() ? '检查' : '不会 · 看答案'}</Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== COMPREHENSION — collapsible, secondary ===== */}
      <Collapse label="理解自测" count={l.comprehension.length}>
        <RowGroup>
          {l.comprehension.map((qa, i) => <QAItem key={i} q={qa.q} a={qa.a} />)}
        </RowGroup>
      </Collapse>
    </div>
  )
}
