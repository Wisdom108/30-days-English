import { Play } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, ReadableText } from '../shared'
import { Badge, Button, Card, CardBody, SectionLabel } from '../ui'
import BlockFooter from './BlockFooter'

export default function ReadingBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const r = lesson.reading
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px]">📖 阅读 · {r.title}</h2>
          <Badge variant="warning">🌆 傍晚 25′</Badge>
        </div>
        <p className="mt-1 text-[13px] text-fg-muted">
          先通读理解大意，遇到生词 <b className="text-fg-secondary">点一下</b> 即可查释义并听发音。
        </p>

        <Button variant="ghost" size="sm" className="mt-3" onClick={() => speak(r.passage, 0.95)}>
          <Play size={14} /> 朗读全文
        </Button>

        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-4">
          <ReadableText text={r.passage} />
        </div>

        <SectionLabel>📌 重点词汇</SectionLabel>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {r.glossary.map((g, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border/70 py-1.5 text-[13px]">
              <b className="font-medium">{g.word}</b>
              <span className="text-fg-muted">{g.meaning_zh}</span>
            </div>
          ))}
        </div>

        <SectionLabel>❓ 阅读理解</SectionLabel>
        <div className="space-y-2">
          {r.comprehension.map((qa, i) => (
            <QAItem key={i} q={qa.q} a={qa.a} />
          ))}
        </div>

        <BlockFooter done={done} onComplete={onComplete} />
      </CardBody>
    </Card>
  )
}
