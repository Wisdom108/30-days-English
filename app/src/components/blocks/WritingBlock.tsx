import { useState } from 'react'
import { Check } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { SpeakButton } from '../shared'
import { Badge, Button, Card, CardBody, Callout, SectionLabel, Textarea } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

export default function WritingBlock({
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
  const w = lesson.writing
  const { state, storeWriting } = useApp()
  const [text, setText] = useState(state.writings[lesson.day] || '')
  const [showModel, setShowModel] = useState(false)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <h2 className="text-h2 font-semibold">写作 · 睡前巩固</h2>
          <Badge variant="warning">睡前 · 30′</Badge>
        </div>

        <Callout tone="accent" className="mt-3">
          <span className="text-body">
            <b className="text-brand">题目：</b>
            {w.prompt}
          </span>
        </Callout>

        <SectionLabel>实用表达</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {w.usefulPhrases.map((p, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm text-fg-secondary"
            >
              {p} <SpeakButton text={p} />
            </span>
          ))}
        </div>

        <SectionLabel>我的写作</SectionLabel>
        <Textarea
          aria-label="我的写作"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            storeWriting(lesson.day, e.target.value)
          }}
          placeholder="在这里用英文写下你的答案…"
          className="min-h-[140px]"
        />
        <div className="mt-1 text-meta text-fg-dim">
          <span className="t-num">{words}</span> 词 · 自动保存
        </div>

        <SectionLabel>自查清单</SectionLabel>
        <ul className="space-y-1">
          {w.selfCheck.map((c, i) => (
            <SelfCheckItem key={i} text={c} />
          ))}
        </ul>

        <Button variant="secondary" className="mt-4" onClick={() => setShowModel((s) => !s)}>
          {showModel ? '隐藏范文' : '对照范文'}
        </Button>
        {showModel && (
          <div className="mt-3 rounded-lg border border-border bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="label-nd">范文</span>
              <SpeakButton text={w.modelAnswer} />
            </div>
            <p className="mt-1.5 text-body leading-relaxed text-fg-secondary">{w.modelAnswer}</p>
          </div>
        )}

        <BlockFooter done={done} onComplete={onComplete} onUndo={onUndo} />
      </CardBody>
    </Card>
  )
}

function SelfCheckItem({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <li>
      <button
        type="button"
        aria-pressed={c}
        onClick={() => setC((v) => !v)}
        className="group flex min-h-11 w-full items-center gap-2.5 rounded-md py-1.5 text-left text-sm outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span
          aria-hidden
          className={cn(
            'grid h-5 w-5 shrink-0 place-items-center rounded-sm border transition-colors',
            c
              ? 'border-brand bg-brand text-brand-fg'
              : 'border-border-strong text-transparent group-hover:border-fg-muted',
          )}
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <span className={cn('leading-relaxed', c ? 'text-fg-dim line-through' : 'text-fg-secondary')}>
          {text}
        </span>
      </button>
    </li>
  )
}
