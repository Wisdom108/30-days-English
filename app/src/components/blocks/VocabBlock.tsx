import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { dueCards } from '../../lib/srs'
import { cn } from '../../lib/utils'
import { SpeakButton } from '../shared'
import { Button, Card, CardBody, Callout, Segment, Segmented } from '../ui'
import BlockFooter from './BlockFooter'

export default function VocabBlock({
  lesson,
  done,
  onComplete,
  onUndo,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
  onUndo?: () => void
}) {
  const { state } = useApp()
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const [flip, setFlip] = useState(false)
  const [mode, setMode] = useState<'browse' | 'quiz'>('browse')

  const words = lesson.vocabulary
  const due = dueCards(state.cards).length
  const card = words[i]

  return (
    <Card>
      <CardBody>
        <h2 className="text-h2 font-semibold">词汇复习</h2>
        <div className="mt-1 text-sm text-fg-muted">
          本课 <span className="t-tab font-semibold text-fg-secondary">{words.length}</span> 个高频词 · SRS 间隔记忆
        </div>

        {due > 0 && (
          <Callout tone="warning" className="mt-3 items-center">
            <div className="flex w-full items-center justify-between gap-3">
              <span>
                你有 <b className="t-tab font-semibold text-fg">{due}</b> 张到期词卡需间隔复习
              </span>
              <Button size="sm" onClick={() => nav('/review')}>去复习</Button>
            </div>
          </Callout>
        )}

        <Segmented
          className="mt-3"
          value={mode}
          onChange={(m) => {
            setMode(m)
            setI(0)
            setFlip(false)
          }}
          options={[
            { value: 'browse', label: '浏览学习' },
            { value: 'quiz', label: '翻卡自测' },
          ]}
        />

        {mode === 'browse' && (
          <div className="mt-4 grid gap-2.5 animate-in-up sm:grid-cols-2">
            {words.map((w, idx) => (
              <Segment key={idx} className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-h2 font-semibold text-fg">
                    {w.word}{' '}
                    <span className="text-meta font-normal italic text-fg-muted">{w.pos}</span>
                  </span>
                  <SpeakButton text={w.word} />
                </div>
                <div className="font-mono text-sm text-fg-muted">{w.ipa}</div>
                <div className="mt-0.5 text-body text-fg-secondary">{w.meaning_zh}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-muted">{w.example_en}</span>
                  <SpeakButton text={w.example_en} />
                </div>
                <div className="text-meta text-fg-muted">{w.example_zh}</div>
              </Segment>
            ))}
          </div>
        )}

        {mode === 'quiz' && card && (
          <div className="animate-in-up">
            {/* 3D flip self-test — physically rotates via .flip-3d utilities */}
            <div
              role="button"
              tabIndex={0}
              aria-label="翻转词卡"
              aria-pressed={flip}
              onClick={() => setFlip((f) => !f)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFlip((f) => !f)
                }
              }}
              className="mt-4 w-full cursor-pointer select-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              style={{ perspective: '1200px' }}
            >
              <div className={cn('flip-3d grid min-h-[240px] w-full', flip && 'flipped')}>
                {/* front */}
                <div
                  className={cn(
                    'flip-face col-start-1 row-start-1 flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-surface p-7 text-center shadow-[var(--shadow-card)]',
                    flip && 'pointer-events-none',
                  )}
                >
                  <div className="text-hero font-semibold text-fg">{card.word}</div>
                  <div className="font-mono text-h2 text-fg-muted">{card.ipa}</div>
                  <SpeakButton text={card.word} />
                  <div className="text-meta text-fg-muted">点击卡片翻面看释义</div>
                </div>
                {/* back */}
                <div
                  className={cn(
                    'flip-face flip-back col-start-1 row-start-1 flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-surface p-7 text-center shadow-[var(--shadow-card)]',
                    !flip && 'pointer-events-none',
                  )}
                >
                  <div className="text-h1 font-medium text-fg">{card.meaning_zh}</div>
                  <div className="text-body-lg text-fg-secondary">{card.example_en}</div>
                  <div className="text-sm text-fg-muted">{card.example_zh}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                disabled={i === 0}
                onClick={() => {
                  setI((p) => p - 1)
                  setFlip(false)
                }}
              >
                <ChevronLeft size={15} /> 上一张
              </Button>
              <span className="t-tab text-sm text-fg-muted">
                {i + 1} / {words.length}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={i === words.length - 1}
                onClick={() => {
                  setI((p) => p + 1)
                  setFlip(false)
                }}
              >
                下一张 <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}

        <BlockFooter done={done} onComplete={onComplete} onUndo={onUndo} />
      </CardBody>
    </Card>
  )
}
