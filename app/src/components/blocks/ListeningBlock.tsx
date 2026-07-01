import { useState } from 'react'
import { Play, Rabbit, FileText } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, RowGroup, SpeakButton } from '../shared'
import { Badge, Button, Card, CardBody, Input, SectionLabel } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

export default function ListeningBlock({
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
  const l = lesson.listening
  const [showScript, setShowScript] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)

  const sentences = l.script.split(/(?<=[.!?])\s+/).filter(Boolean)
  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9']/g, '')

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h2 font-semibold">精听 · {l.title}</h2>
          <Badge variant="warning">晨起 · 30′</Badge>
        </div>
        <p className="mt-1 text-sm text-fg-muted">先盲听整段 2–3 遍，再逐句跟读，最后做听写。别急着看原文！</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => speak(l.script, 0.95)}><Play size={15} /> 播放全文</Button>
          <Button variant="secondary" onClick={() => speak(l.script, 0.7)}><Rabbit size={15} /> 慢速</Button>
          <Button variant="ghost" onClick={() => setShowScript((s) => !s)}>
            <FileText size={15} /> {showScript ? '隐藏原文' : '显示原文'}
          </Button>
        </div>

        {showScript && (
          <RowGroup>
            {sentences.map((s, i) => (
              <div key={i} className={cn('flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-hover', i > 0 && 'border-t border-border-soft')}>
                <span className="text-sm text-fg-secondary">{s}</span>
                <SpeakButton text={s} />
              </div>
            ))}
          </RowGroup>
        )}

        <SectionLabel>听写填空</SectionLabel>
        <p className="-mt-1 mb-2 text-sm text-fg-muted">播放句子，把听到的词填进空格。</p>
        <RowGroup>
          {l.dictation.map((d, i) => {
            const ok = checked && norm(answers[i] || '') === norm(d.answer)
            const bad = checked && !ok
            const parts = d.sentence.split('____')
            return (
              <div key={i} className={cn('px-3.5 py-3 hover:bg-hover', i > 0 && 'border-t border-border-soft')}>
                <div className="flex flex-wrap items-center gap-2">
                  <SpeakButton text={d.sentence.replace('____', d.answer)} />
                  <span className="text-body">{parts[0]}</span>
                  <Input
                    aria-label={`听写填空 第${i + 1}题`}
                    className={cn(
                      'w-24',
                      ok ? 'border-brand text-fg' : bad ? 'border-danger' : undefined,
                    )}
                    value={answers[i] || ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                    placeholder="填空"
                  />
                  <span className="text-body">{parts[1]}</span>
                </div>
                {bad && (
                  <div className="mt-1.5 text-meta text-fg-secondary">
                    答案：<span className="text-fg">{d.answer}</span>
                  </div>
                )}
              </div>
            )
          })}
        </RowGroup>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setChecked(true)}>
          检查听写
        </Button>

        <SectionLabel>听力理解</SectionLabel>
        <RowGroup>
          {l.comprehension.map((qa, i) => (
            <QAItem key={i} q={qa.q} a={qa.a} />
          ))}
        </RowGroup>

        <BlockFooter done={done} onComplete={onComplete} onUndo={onUndo} />
      </CardBody>
    </Card>
  )
}
