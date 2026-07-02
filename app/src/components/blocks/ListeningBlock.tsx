import { useState } from 'react'
import { Play, Pause, Rabbit, RotateCw, Check, ChevronDown } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speak, stopSpeaking } from '../../lib/speech'
import { QAItem, RowGroup } from '../shared'
import { Button } from '../ui'
import { cn } from '../../lib/utils'

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9']/g, '')

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

export default function ListeningBlock({ lesson }: { lesson: DayLesson; done?: boolean; onComplete?: () => void; onUndo?: () => void }) {
  const l = lesson.listening
  const [playing, setPlaying] = useState(false)
  const [di, setDi] = useState(0)
  const [ans, setAns] = useState('')
  const [result, setResult] = useState<null | 'ok' | 'bad'>(null)
  const [compOpen, setCompOpen] = useState(false)

  const play = async (rate = 1) => {
    if (playing) { stopSpeaking(); setPlaying(false); return }
    setPlaying(true)
    await speak(l.script, rate)
    setPlaying(false)
  }

  const cur = l.dictation[di]
  const total = l.dictation.length
  const dictDone = di >= total
  const parts = cur ? cur.sentence.split('____') : ['', '']

  const check = () => setResult(norm(ans) === norm(cur.answer) ? 'ok' : 'bad')
  const next = () => { setDi((n) => n + 1); setAns(''); setResult(null) }

  // tappable words in the hero script
  const words = l.script.split(/(\s+)/)

  return (
    <div className="space-y-4">
      {/* ===== HERO — the audio + script is the star ===== */}
      <div
        className="relative overflow-hidden rounded-[22px] border border-border-strong px-6 pb-7 pt-8 text-center"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, #17171a 0%, #0d0d0f 62%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04), 0 20px 60px -32px rgba(0,0,0,.9)' }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">现在精听 · {l.title}</div>

        {/* big play orb */}
        <div className="relative mx-auto my-5 h-28 w-28">
          {playing && <span className="pulse-red absolute -inset-2.5 rounded-full border border-fg/10" />}
          <span className="absolute inset-0 rounded-full border-2 border-border-vis" />
          <button
            onClick={() => play()}
            aria-label={playing ? '暂停' : '播放全文'}
            className="absolute inset-3.5 grid place-items-center rounded-full bg-brand text-brand-fg shadow-[0_8px_30px_-8px_rgba(255,255,255,.35)] transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {playing ? <Pause size={32} /> : <Play size={32} className="translate-x-0.5" fill="currentColor" />}
          </button>
        </div>

        <Waveform playing={playing} />

        {/* the sentence(s) — LARGEST thing on screen */}
        <div className="mt-5 text-[22px] font-semibold leading-[1.4] tracking-[-0.01em] text-fg">
          {words.map((w, i) => {
            if (/^\s+$/.test(w)) return w
            const clean = w.replace(/[^A-Za-z'-]/g, '')
            return (
              <span
                key={i}
                onClick={() => clean && speak(clean)}
                className="cursor-pointer rounded px-0.5 hover:bg-accent-soft"
              >
                {w}
              </span>
            )
          })}
        </div>

        <button
          onClick={() => play(0.7)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-[rgba(255,255,255,.02)] px-4 py-2.5 text-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Rabbit size={15} /> 慢速重听
        </button>
      </div>

      {/* ===== DICTATION — one sentence at a time ===== */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="label-nd">听写</span>
          <span className="t-num text-sm text-fg-muted">{Math.min(di + 1, total)} / {total}</span>
        </div>

        {dictDone ? (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-fg text-black"><Check size={18} strokeWidth={3} /></span>
            <div className="text-sm text-fg-secondary">听写完成 · 共 {total} 句</div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setDi(0); setAns(''); setResult(null) }}>重做</Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="text-[20px] leading-[1.7] text-fg">
              {parts[0]}
              <span className={cn('mx-1 inline-block min-w-[92px] border-b-2 text-center font-semibold', result === 'ok' ? 'border-fg text-fg' : result === 'bad' ? 'border-red text-red' : 'border-red/70 text-fg')}>
                {result === 'bad' ? cur.answer : ans || ' '}
              </span>
              {parts[1]}
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={() => speak(cur.sentence.replace('____', cur.answer))}
                aria-label="重听这句"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <RotateCw size={18} />
              </button>
              <input
                value={ans}
                onChange={(e) => { setAns(e.target.value); setResult(null) }}
                onKeyDown={(e) => e.key === 'Enter' && (result === 'ok' ? next() : check())}
                placeholder="听到的词…"
                aria-label={`听写填空 第 ${di + 1} 题`}
                className="h-12 flex-1 rounded-xl border border-border-strong bg-surface-2 px-4 text-body-lg text-fg outline-none placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </div>

            {result === 'bad' && <p className="mt-2.5 text-sm text-fg-muted">正确答案：<span className="text-fg">{cur.answer}</span></p>}

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
                <Button size="sm" disabled={!ans.trim()} onClick={check}>检查</Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== COMPREHENSION — collapsible, secondary ===== */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <button
          onClick={() => setCompOpen((o) => !o)}
          aria-expanded={compOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-hover"
        >
          <span className="label-nd">理解自测 · {l.comprehension.length} 题</span>
          <ChevronDown size={17} className={cn('text-fg-muted transition-transform', compOpen && 'rotate-180')} />
        </button>
        {compOpen && (
          <div className="border-t border-border">
            <RowGroup>
              {l.comprehension.map((qa, i) => <QAItem key={i} q={qa.q} a={qa.a} />)}
            </RowGroup>
          </div>
        )}
      </div>
    </div>
  )
}
