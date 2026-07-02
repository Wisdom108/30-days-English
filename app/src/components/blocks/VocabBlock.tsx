import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { dueCards } from '../../lib/srs'
import { cn } from '../../lib/utils'
import { SpeakButton } from '../shared'
import { Button, Segment } from '../ui'

export default function VocabBlock({
  lesson,
}: {
  lesson: DayLesson
  done?: boolean
  onComplete?: () => void
  onUndo?: () => void
}) {
  const { state } = useApp()
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const [flip, setFlip] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const words = lesson.vocabulary
  const due = dueCards(state.cards).length
  const card = words[i]
  const go = (d: number) => { setI((p) => Math.min(Math.max(p + d, 0), words.length - 1)); setFlip(false) }

  return (
    <div className="space-y-4">
      {due > 0 && (
        <button
          onClick={() => nav('/review')}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-red/40 bg-red-soft px-4 py-3 text-left transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-fg">
            <RotateCcw size={14} className="text-red" /><b className="t-tab text-red">{due}</b> 张词卡到期
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">去复习 →</span>
        </button>
      )}

      {/* ===== HERO flashcard ===== */}
      <div style={{ perspective: '1400px' }}>
        <div
          role="button"
          tabIndex={0}
          aria-label="翻转词卡"
          aria-pressed={flip}
          onClick={() => setFlip((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlip((f) => !f) }
            else if (e.key === 'ArrowRight') go(1)
            else if (e.key === 'ArrowLeft') go(-1)
          }}
          className="w-full cursor-pointer select-none rounded-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <div className={cn('flip-3d grid min-h-[320px] w-full', flip && 'flipped')}>
            {/* front */}
            <div className="flip-face col-start-1 row-start-1 flex flex-col overflow-hidden rounded-[22px] border border-border-strong"
              style={{ background: 'radial-gradient(120% 80% at 50% 0%, #17171a 0%, #0d0d0f 62%)' }}>
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="label-nd">词汇 · <span className="t-tab text-fg-secondary">{i + 1}/{words.length}</span></span>
                <SpeakButton text={card.word} />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-[42px] font-semibold leading-none text-fg">{card.word}</div>
                <div className="flex items-center gap-2 text-fg-muted">
                  <span className="text-h2">{card.ipa}</span>
                  <span className="text-sm italic text-fg-dim">{card.pos}</span>
                </div>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">点击翻面看释义</div>
              </div>
            </div>
            {/* back */}
            <div className="flip-face flip-back col-start-1 row-start-1 flex flex-col overflow-hidden rounded-[22px] border border-border-strong bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="label-nd">释义</span>
                <SpeakButton text={card.example_en} />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
                <div className="text-h1 font-semibold text-fg">{card.meaning_zh}</div>
                <div className="text-body-lg text-fg-secondary">{card.example_en}</div>
                <div className="text-sm text-fg-muted">{card.example_zh}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* deck nav */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" disabled={i === 0} onClick={() => go(-1)}>
          <ChevronLeft size={15} /> 上一张
        </Button>
        <div className="flex flex-wrap justify-center gap-1.5 px-2">
          {words.map((_, idx) => (
            <span key={idx} className={cn('h-1.5 w-1.5 rounded-[2px]', idx === i ? 'bg-red' : idx < i ? 'bg-fg' : 'border border-border-strong')} />
          ))}
        </div>
        <Button variant="secondary" size="sm" disabled={i === words.length - 1} onClick={() => go(1)}>
          下一张 <ChevronRight size={15} />
        </Button>
      </div>

      {/* browse all — collapsible, secondary */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <button
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-hover"
        >
          <span className="label-nd">浏览全部 · <span className="t-tab text-fg-secondary">{words.length}</span> 词</span>
          <ChevronDown size={17} className={cn('text-fg-muted transition-transform', listOpen && 'rotate-180')} />
        </button>
        {listOpen && (
          <div className="grid gap-2.5 border-t border-border p-3 sm:grid-cols-2">
            {words.map((w, idx) => (
              <Segment key={idx} className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-h3 font-semibold text-fg">{w.word} <span className="text-meta font-normal italic text-fg-muted">{w.pos}</span></span>
                  <SpeakButton text={w.word} />
                </div>
                <div className="text-sm text-fg-muted">{w.ipa}</div>
                <div className="mt-0.5 text-body text-fg-secondary">{w.meaning_zh}</div>
              </Segment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
