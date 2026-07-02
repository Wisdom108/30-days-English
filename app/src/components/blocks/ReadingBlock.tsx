import { Play } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, ReadableText, RowGroup } from '../shared'
import { Button, Card, CardBody, SectionLabel, Segment } from '../ui'
import { cn } from '../../lib/utils'

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
    <Card>
      <CardBody>
        <h2 className="text-h2 font-semibold text-fg">阅读 · {r.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          先通读理解大意，遇到生词 <b className="font-medium text-fg-secondary">点一下</b> 即可查释义并听发音。
        </p>

        <Button variant="secondary" size="sm" className="mt-3" onClick={() => speak(r.passage, 0.95)}>
          <Play size={14} /> 朗读全文
        </Button>

        <Segment className="mt-3 p-4">
          <ReadableText text={r.passage} glossary={r.glossary} />
        </Segment>

        <SectionLabel>生词表</SectionLabel>
        <RowGroup>
          {r.glossary.map((g, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-hover',
                i > 0 && 'border-t border-border-soft',
              )}
            >
              <b className="font-medium text-fg">{g.word}</b>
              <span className="text-fg-muted">{g.meaning_zh}</span>
            </div>
          ))}
        </RowGroup>

        <SectionLabel>理解自测</SectionLabel>
        <RowGroup>
          {r.comprehension.map((qa, i) => (
            <QAItem key={i} q={qa.q} a={qa.a} />
          ))}
        </RowGroup>

      </CardBody>
    </Card>
  )
}
