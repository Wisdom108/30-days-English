import { useState, type ReactNode } from 'react'
import { Check, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { SpeakButton, RowGroup } from '../shared'
import { AiGate } from '../ai'
import { aiWriting, AIError, type WritingFeedback, type LessonCtx } from '../../lib/ai'
import { Button, Callout, Segment, Textarea } from '../ui'
import { cn } from '../../lib/utils'

function ctxOf(l: DayLesson): LessonCtx {
  return { day: l.day, theme: l.theme, title_en: l.title_en, grammar: l.grammarNote?.point_en, level: 'A2-B1' }
}

function Collapse({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-hover">
        <span className="label-nd">{label}{count != null && <> · <span className="t-num text-fg-secondary">{count}</span></>}</span>
        <ChevronDown size={17} className={cn('text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  )
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
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  const [fb, setFb] = useState<WritingFeedback | null>(null)
  const [fbBusy, setFbBusy] = useState(false)
  const [fbErr, setFbErr] = useState<string | null>(null)
  const runFeedback = async () => {
    if (!text.trim()) return setFbErr('先写点内容再批改哦')
    setFbBusy(true); setFbErr(null)
    try { const { feedback } = await aiWriting(text, ctxOf(lesson), w.prompt); setFb(feedback) }
    catch (e) { setFbErr(e instanceof AIError ? e.message : '批改失败，请重试') }
    finally { setFbBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* ===== HERO — the prompt + your writing surface ===== */}
      <div className="overflow-hidden rounded-[22px] border border-border-strong bg-surface">
        <div className="border-b border-border px-6 py-5">
          <div className="label-nd mb-2">今日写作 · 睡前巩固</div>
          <p className="text-body-lg leading-relaxed text-fg">{w.prompt}</p>
        </div>
        <div className="p-4">
          <Textarea
            aria-label="我的写作"
            value={text}
            onChange={(e) => { setText(e.target.value); storeWriting(lesson.day, e.target.value) }}
            placeholder="在这里用英文写下你的答案…"
            className="min-h-[200px] border-0 bg-transparent p-2 text-body-lg leading-relaxed focus:ring-0"
          />
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-dim"><span className="t-num text-fg-secondary">{words}</span> 词 · 自动保存</span>
          </div>
        </div>
      </div>

      {/* AI feedback — primary action / prominent result */}
      <AiGate>
        {!fb ? (
          <div>
            <Button className="w-full" size="lg" disabled={fbBusy} onClick={runFeedback}>
              {fbBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} 让 AI 批改我的写作
            </Button>
            <p className="mt-2 text-center text-meta text-fg-muted">指出语法 / 用词 / 地道度，给出润色版与打分</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[22px] border border-border-strong bg-surface animate-in-up">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <div className="label-nd mb-1.5">AI 批改</div>
                <div className="flex items-baseline gap-1">
                  <span className="t-num text-[44px] font-semibold leading-none text-fg">{fb.score}</span>
                  <span className="text-h2 text-fg-muted">/100</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFb(null)}>重新批改</Button>
            </div>
            <div className="space-y-3 p-5">
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
              <Segment className="p-4">
                <div className="flex items-center justify-between">
                  <span className="label-nd">润色版</span>
                  <SpeakButton text={fb.polished} />
                </div>
                <p className="mt-1.5 text-body leading-relaxed text-fg">{fb.polished}</p>
              </Segment>
            </div>
          </div>
        )}
        {fbErr && <Callout tone="red" role="alert" className="mt-2 animate-in-up">{fbErr}</Callout>}
      </AiGate>

      {/* helpers — secondary */}
      <Collapse label="常用表达" count={w.usefulPhrases.length}>
        <div className="flex flex-wrap gap-2 p-4">
          {w.usefulPhrases.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm text-fg-secondary">
              {p} <SpeakButton text={p} />
            </span>
          ))}
        </div>
      </Collapse>

      <Collapse label="自查清单" count={w.selfCheck.length}>
        <ul className="space-y-1 p-4">
          {w.selfCheck.map((c, i) => <SelfCheckItem key={i} text={c} />)}
        </ul>
      </Collapse>

      <Collapse label="对照范文">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <span className="label-nd">范文</span>
            <SpeakButton text={w.modelAnswer} />
          </div>
          <p className="mt-1.5 text-body leading-relaxed text-fg-secondary">{w.modelAnswer}</p>
        </div>
      </Collapse>
    </div>
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
        <span aria-hidden className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-sm border transition-colors', c ? 'border-brand bg-brand text-brand-fg' : 'border-border-strong text-transparent group-hover:border-fg-muted')}>
          <Check size={13} strokeWidth={3} />
        </span>
        <span className={cn('leading-relaxed', c ? 'text-fg-dim line-through' : 'text-fg-secondary')}>{text}</span>
      </button>
    </li>
  )
}
