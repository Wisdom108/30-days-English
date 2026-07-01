import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { dueCards } from '../../lib/srs'
import { SpeakButton } from '../shared'
import { Badge, Button, Card, CardBody } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

export default function VocabBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
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
        <div className="flex items-center justify-between">
          <h2 className="text-[17px]">🔤 词汇 · {words.length} 个高频词</h2>
          <Badge variant="warning">☕ 晨间 20′</Badge>
        </div>

        {due > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-warning/20 bg-warning/[0.06] px-3.5 py-3">
            <span className="text-[13px] text-fg-secondary">🔁 你有 <b className="text-warning">{due}</b> 张到期词卡需间隔复习</span>
            <Button size="sm" onClick={() => nav('/review')}>去复习</Button>
          </div>
        )}

        <div className="mt-3 inline-flex rounded-lg border border-border bg-surface-2 p-1">
          {(['browse', 'quiz'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setI(0); setFlip(false) }}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] font-medium transition-all',
                mode === m ? 'bg-elevated text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {m === 'browse' ? '📖 浏览学习' : '🎴 卡片自测'}
            </button>
          ))}
        </div>

        {mode === 'browse' && (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {words.map((w, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-surface-2 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[18px] font-semibold">
                    {w.word} <span className="text-[12px] font-normal italic text-fg-dim">{w.pos}</span>
                  </span>
                  <SpeakButton text={w.word} />
                </div>
                <div className="text-[13px] text-warning">{w.ipa}</div>
                <div className="mt-0.5 text-[14px] text-fg-secondary">{w.meaning_zh}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[13px] text-fg-muted">{w.example_en}</span>
                  <SpeakButton text={w.example_en} />
                </div>
                <div className="text-[12px] text-fg-dim">{w.example_zh}</div>
              </div>
            ))}
          </div>
        )}

        {mode === 'quiz' && card && (
          <>
            <button
              onClick={() => setFlip((f) => !f)}
              className="mt-4 flex min-h-[240px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-border bg-gradient-to-b from-surface-2 to-surface p-7 text-center"
            >
              {!flip ? (
                <>
                  <div className="text-[34px] font-semibold">{card.word}</div>
                  <div className="text-[18px] text-warning">{card.ipa}</div>
                  <SpeakButton text={card.word} />
                  <div className="text-[12px] text-fg-dim">点击卡片翻面看释义</div>
                </>
              ) : (
                <>
                  <div className="text-[20px] font-medium">{card.meaning_zh}</div>
                  <div className="text-[14px] text-fg-secondary">{card.example_en}</div>
                  <div className="text-[13px] text-fg-dim">{card.example_zh}</div>
                </>
              )}
            </button>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="secondary" size="sm" disabled={i === 0} onClick={() => { setI((p) => p - 1); setFlip(false) }}>
                <ChevronLeft size={15} /> 上一张
              </Button>
              <span className="text-[13px] text-fg-dim">{i + 1} / {words.length}</span>
              <Button variant="secondary" size="sm" disabled={i === words.length - 1} onClick={() => { setI((p) => p + 1); setFlip(false) }}>
                下一张 <ChevronRight size={15} />
              </Button>
            </div>
          </>
        )}

        <BlockFooter done={done} onComplete={onComplete} />
      </CardBody>
    </Card>
  )
}
