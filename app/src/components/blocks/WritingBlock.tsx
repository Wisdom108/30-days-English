import { useState } from 'react'
import { Check, Sparkles, Loader2 } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { SpeakButton, RowGroup } from '../shared'
import { AiGate } from '../ai'
import { aiWriting, AIError, type WritingFeedback, type LessonCtx } from '../../lib/ai'
import { Button, Card, CardBody, Callout, SectionLabel, Segment, Textarea } from '../ui'
import { cn } from '../../lib/utils'

function ctxOf(l: DayLesson): LessonCtx {
  return { day: l.day, theme: l.theme, title_en: l.title_en, grammar: l.grammarNote?.point_en, level: 'A2-B1' }
}

export default function WritingBlock({
  lesson,
}: {
  lesson: DayLesson
  done?: boolean
  onComplete?: () => void
  onUndo?: () => void
}) {
  const w = lesson.writing
  const { state, storeWriting } = useApp()
  const [text, setText] = useState(state.writings[lesson.day] || '')
  const [showModel, setShowModel] = useState(false)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  const [fb, setFb] = useState<WritingFeedback | null>(null)
  const [fbBusy, setFbBusy] = useState(false)
  const [fbErr, setFbErr] = useState<string | null>(null)
  const runFeedback = async () => {
    if (!text.trim()) return setFbErr('先写点内容再批改哦')
    setFbBusy(true)
    setFbErr(null)
    try {
      const { feedback } = await aiWriting(text, ctxOf(lesson), w.prompt)
      setFb(feedback)
    } catch (e) {
      setFbErr(e instanceof AIError ? e.message : '批改失败，请重试')
    } finally {
      setFbBusy(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <h2 className="text-h2 font-semibold">写作 · 睡前巩固</h2>

        <Callout tone="accent" className="mt-3">
          <span className="text-body">
            <b className="text-brand">题目：</b>
            {w.prompt}
          </span>
        </Callout>

        <SectionLabel>常用表达</SectionLabel>
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
        <div className="mt-1 text-meta text-fg-muted">
          <span className="t-tab">{words}</span> 词 · 自动保存
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
          <Segment className="mt-3 p-4 animate-in-up">
            <div className="flex items-center justify-between">
              <span className="label-nd">范文</span>
              <SpeakButton text={w.modelAnswer} />
            </div>
            <p className="mt-1.5 text-body leading-relaxed text-fg-secondary">{w.modelAnswer}</p>
          </Segment>
        )}

        <SectionLabel>AI 批改</SectionLabel>
        <AiGate>
          {!fb ? (
            <div>
              <Button variant="secondary" disabled={fbBusy} onClick={runFeedback}>
                {fbBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-fg-muted" />}
                让 AI 批改我的写作
              </Button>
              <p className="mt-1.5 text-meta text-fg-muted">AI 会指出语法/用词/地道度问题，并给出润色版与打分。</p>
            </div>
          ) : (
            <div className="space-y-3 animate-in-up">
              <div className="flex items-center gap-2.5">
                <span className="label-nd">得分</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5">
                  <span className="t-num text-sm text-fg">{fb.score}</span>
                  <span className="t-tab text-meta text-fg-muted">/ 100</span>
                </span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFb(null)}>重新批改</Button>
              </div>
              <p className="text-sm leading-relaxed text-fg-secondary">{fb.overall_zh}</p>
              {fb.corrections.length > 0 && (
                <RowGroup>
                  {fb.corrections.map((c, i) => (
                    <div key={i} className={cn('px-3.5 py-2.5', i > 0 && 'border-t border-border-soft')}>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-danger line-through">{c.original}</span>
                        <span className="text-fg-muted">→</span>
                        <span className="text-fg">{c.fixed}</span>
                      </div>
                      <div className="mt-0.5 text-meta text-fg-muted">{c.why_zh}</div>
                    </div>
                  ))}
                </RowGroup>
              )}
              <Segment className="p-3.5">
                <div className="flex items-center justify-between">
                  <span className="label-nd">润色版</span>
                  <SpeakButton text={fb.polished} />
                </div>
                <p className="mt-1.5 text-body leading-relaxed text-fg">{fb.polished}</p>
              </Segment>
            </div>
          )}
          {fbErr && (
            <Callout tone="red" role="alert" className="mt-2 animate-in-up">
              {fbErr}
            </Callout>
          )}
        </AiGate>

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
