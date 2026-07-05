import { useEffect, useRef, useState } from 'react'
import type { DayLesson } from '../../types'
import { cn } from '../../lib/utils'
import { prefetchSpeak } from '../../lib/speech'
import { SpeakButton } from '../shared'
import { Stepper } from '../ui'

export default function VocabBlock({ lesson }: { lesson: DayLesson }) {
  const [i, setI] = useState(0)
  const [flip, setFlip] = useState(false)
  const touchX = useRef<number | null>(null)
  const swiped = useRef(false)

  const words = lesson.vocabulary
  const card = words[i]
  const go = (d: number) => { setI((p) => Math.min(Math.max(p + d, 0), words.length - 1)); setFlip(false) }

  // Warm the audio for the visible word (and the example once flipped) so the
  // speaker tap is instant instead of a dead wait.
  useEffect(() => { prefetchSpeak(card.word) }, [card.word])
  useEffect(() => { if (flip) prefetchSpeak(card.example_en) }, [flip, card.example_en])

  return (
    <div className="space-y-4">
      {/* ===== HERO flashcard ===== */}
      <div style={{ perspective: '1400px' }}>
        {/* keyed by index: each word remounts at the FRONT face (no un-flip replay
            of the previous card's back) and slides in cleanly */}
        {/* outer wrapper stays MOUNTED across cards so keyboard focus (and arrow
            nav) survives; only the inner flip container is keyed by i, remounting
            at the front face with a clean entrance. */}
        <div
          role="button"
          tabIndex={0}
          aria-label="翻转词卡"
          aria-pressed={flip}
          onClick={() => { if (swiped.current) { swiped.current = false; return } setFlip((f) => !f) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlip((f) => !f) }
            else if (e.key === 'ArrowRight') go(1)
            else if (e.key === 'ArrowLeft') go(-1)
          }}
          // reset the swipe flag at gesture start: iOS never fires click after a
          // real swipe, so a stale `true` would swallow the NEXT genuine tap
          onTouchStart={(e) => { swiped.current = false; touchX.current = e.touches[0].clientX }}
          onTouchEnd={(e) => {
            if (touchX.current == null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            touchX.current = null
            if (Math.abs(dx) > 48) { swiped.current = true; go(dx < 0 ? 1 : -1) } // swipe → nav, not flip
          }}
          className="press w-full cursor-pointer select-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {/* keyed entrance wrapper (opacity/translate) — kept OFF the flip-3d so
              its `both` fill can't pin transform and block the rotateY flip */}
          <div key={i} className="animate-in-up">
          <div className={cn('flip-3d grid min-h-[320px] w-full', flip && 'flipped')}>
            {/* front */}
            <div className="hero-card flip-face col-start-1 row-start-1 flex flex-col overflow-hidden rounded-xl border border-border-strong">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="label-nd">词汇 · <span className="t-tab text-fg-secondary">{i + 1}/{words.length}</span></span>
                <SpeakButton text={card.word} />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-[46px] font-semibold leading-none tracking-[-0.03em] text-fg">{card.word}</div>
                <div className="flex items-center gap-2 text-fg-muted">
                  <span className="t-ipa text-h2">{card.ipa}</span>
                  <span className="text-sm italic text-fg-dim">{card.pos}</span>
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">点击翻面看释义</div>
              </div>
            </div>
            {/* back */}
            <div className="flip-face flip-back col-start-1 row-start-1 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="label-nd">释义</span>
                <SpeakButton text={card.example_en} />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
                <div className="text-h1 font-semibold text-fg">{card.meaning_zh}</div>
                <div className="text-[18px] leading-snug tracking-[-0.01em] text-fg-secondary">{card.example_en}</div>
                <div className="text-sm text-fg-muted">{card.example_zh}</div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* deck nav — header 1/8 counter is the position indicator */}
      <Stepper idx={i} total={words.length} onStep={go} />
    </div>
  )
}
