import { useState } from 'react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { SpeakButton } from '../shared'
import { Badge, Button, Card, CardBody, Callout, SectionLabel } from '../ui'
import BlockFooter from './BlockFooter'

export default function WritingBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
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
          <h2 className="text-[17px] font-semibold">写作 · 睡前巩固</h2>
          <Badge variant="warning">睡前 · 30′</Badge>
        </div>

        <Callout tone="accent" className="mt-3">
          <span className="text-[14px]"><b className="text-brand">题目：</b>{w.prompt}</span>
        </Callout>

        <SectionLabel>实用表达</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {w.usefulPhrases.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-[13px]">
              {p} <SpeakButton text={p} />
            </span>
          ))}
        </div>

        <SectionLabel>我的写作</SectionLabel>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            storeWriting(lesson.day, e.target.value)
          }}
          placeholder="在这里用英文写下你的答案…"
          className="min-h-[140px] w-full resize-y rounded-[8px] border border-border bg-surface p-3.5 text-[14px] outline-none transition-shadow placeholder:text-fg-dim focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <div className="mt-1 text-[12px] text-fg-dim">{words} 词 · 自动保存</div>

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
          <div className="mt-3 rounded-[8px] border border-border bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <b className="text-[12px] uppercase tracking-wide text-fg-dim">范文</b>
              <SpeakButton text={w.modelAnswer} />
            </div>
            <p className="mt-1 text-[14px] text-fg-secondary">{w.modelAnswer}</p>
          </div>
        )}

        <BlockFooter done={done} onComplete={onComplete} />
      </CardBody>
    </Card>
  )
}

function SelfCheckItem({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <li onClick={() => setC((v) => !v)} className="flex cursor-pointer items-start gap-2 text-[13px]">
      <span>{c ? '☑️' : '⬜'}</span>
      <span className={c ? 'text-fg-dim line-through' : 'text-fg-secondary'}>{text}</span>
    </li>
  )
}
