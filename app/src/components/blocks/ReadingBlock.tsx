import { useState, type ReactNode } from 'react'
import { Play, ChevronDown } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, ReadableText, RowGroup, BlockHead } from '../shared'
import { Button } from '../ui'
import { cn } from '../../lib/utils'

function Collapse({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-hover">
        <span className="label-nd">{label}{count != null && <> · <span className="t-tab text-fg-secondary">{count}</span></>}</span>
        <ChevronDown size={17} className={cn('text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  )
}

export default function ReadingBlock({
  lesson,
}: {
  lesson: DayLesson
  done?: boolean
  onComplete?: () => void
  onUndo?: () => void
}) {
  const r = lesson.reading
  return (
    <div className="space-y-4">
      {/* ===== HERO — immersive passage ===== */}
      <div className="overflow-hidden rounded-[22px] border border-border-strong bg-surface">
        <BlockHead
          tag="阅读"
          title={r.title}
          right={
            <Button variant="secondary" size="sm" onClick={() => speak(r.passage, 0.95)}><Play size={14} /> 朗读全文</Button>
          }
        />
        <div className="px-6 py-6">
          <ReadableText text={r.passage} glossary={r.glossary} serif />
          <p className="mt-5 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-fg-dim">
            遇到生词点一下 · 查释义 + 听发音
          </p>
        </div>
      </div>

      <Collapse label="生词表" count={r.glossary.length}>
        <RowGroup>
          {r.glossary.map((g, i) => (
            <div key={i} className={cn('flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-hover', i > 0 && 'border-t border-border-soft')}>
              <b className="font-medium text-fg">{g.word}</b>
              <span className="text-fg-muted">{g.meaning_zh}</span>
            </div>
          ))}
        </RowGroup>
      </Collapse>

      <Collapse label="理解自测" count={r.comprehension.length}>
        <RowGroup>
          {r.comprehension.map((qa, i) => <QAItem key={i} q={qa.q} a={qa.a} />)}
        </RowGroup>
      </Collapse>
    </div>
  )
}
