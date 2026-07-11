import { useState } from 'react'
import { Play, Square, Loader2 } from 'lucide-react'
import type { DayLesson } from '../../types'
import { speakPassage, stopSpeaking } from '../../lib/speech'
import { QAItem, ReadableText, RowGroup, BlockHead } from '../shared'
import { Button, Collapse } from '../ui'

export default function ReadingBlock({ lesson }: { lesson: DayLesson }) {
  const r = lesson.reading
  // Honest 朗读全文 state: loading until sound starts, playing until it ends.
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing'>('idle')
  const readAloud = async () => {
    if (phase === 'playing') {
      stopSpeaking() // settles the speak() promise below → phase resets
      return
    }
    setPhase('loading')
    await speakPassage(r.passage, 0.95, () => setPhase('playing'))
    setPhase('idle')
  }

  return (
    <div className="space-y-4">
      {/* ===== HERO — immersive passage ===== */}
      <div className="glass-card overflow-hidden rounded-xl">
        <BlockHead
          tag="阅读"
          title={r.title}
          right={
            <Button variant="secondary" size="sm" disabled={phase === 'loading'} onClick={readAloud}>
              {phase === 'loading' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : phase === 'playing' ? (
                <><Square size={13} /> 停止</>
              ) : (
                <><Play size={14} /> 朗读全文</>
              )}
            </Button>
          }
        />
        <div className="label-nd border-b border-border px-6 py-2.5">点任意单词 · 释义 + 发音</div>
        <div className="px-6 py-6">
          <ReadableText text={r.passage} glossary={r.glossary} />
        </div>
      </div>

      <Collapse label="理解自测" count={r.comprehension.length}>
        <RowGroup>
          {r.comprehension.map((qa, i) => <QAItem key={i} q={qa.q} a={qa.a} />)}
        </RowGroup>
      </Collapse>
    </div>
  )
}
