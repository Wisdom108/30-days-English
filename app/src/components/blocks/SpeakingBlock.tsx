import { useState } from 'react'
import { AlertCircle, Mic, MicOff, Play } from 'lucide-react'
import type { DayLesson } from '../../types'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../lib/speech'
import { SpeakButton, RowGroup } from '../shared'
import { Badge, Button, Card, CardBody, Callout, SectionLabel } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

// Not true phonetic scoring — this is a recognizer word-match, so it stays on the
// monochrome intensity ramp (white → gray → red danger tier for a weak catch).
function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? 'bg-success-soft text-success'
      : score >= 55
      ? 'bg-warning-soft text-warning'
      : 'bg-danger-soft text-danger'
  return (
    <span className={cn('inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5', cls)}>
      <span className="t-num text-sm font-semibold leading-none">{score}</span>
      <span className="text-label">匹配</span>
    </span>
  )
}

function ShadowRow({
  text,
  tip,
  first,
  sttOk,
}: {
  text: string
  tip: string
  first: boolean
  sttOk: boolean
}) {
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rec, setRec] = useState(false)

  const record = async () => {
    setRec(true)
    setHeard(null)
    setError(null)
    setScore(null)
    try {
      const { transcript } = await recognizeOnce()
      setHeard(transcript)
      setScore(scorePronunciation(text, transcript))
    } catch {
      // recognizeOnce rejects on timeout / no-speech / error — surface an inline
      // retry hint and never leave the button stuck on "听着…".
      setError('没听清，请再试一次')
    } finally {
      setRec(false)
    }
  }

  return (
    <div className={cn('px-3.5 py-3 transition-colors hover:bg-hover', !first && 'border-t border-border-soft')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 text-body-lg text-fg">{text}</span>
        <div className="flex items-center gap-1">
          <SpeakButton text={text} />
          <SpeakButton text={text} slow />
          <Button
            variant="soft"
            size="sm"
            className="h-9 gap-1.5 px-3"
            onClick={record}
            disabled={rec || !sttOk}
          >
            <Mic size={14} /> {rec ? '听着…' : '跟读'}
          </Button>
        </div>
      </div>
      <div className="mt-1.5 text-meta text-fg-muted">{tip}</div>
      {heard && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-meta text-fg-muted">听到：{heard}</span>
          {score !== null && <ScoreBadge score={score} />}
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-meta text-fg-muted">
          <AlertCircle size={12} className="shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}

export default function SpeakingBlock({
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
  const s = lesson.speaking
  const sttOk = sttSupported()
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <h2 className="text-h2 font-semibold">口语 · 影子跟读</h2>
          <Badge variant="warning">午间 · 40′ · 重点</Badge>
        </div>

        <SectionLabel>发音重点</SectionLabel>
        <ul className="space-y-1.5">
          {s.targetSounds.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-fg-secondary">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
              {t}
            </li>
          ))}
        </ul>

        <SectionLabel>影子跟读</SectionLabel>
        <p className="-mt-1 text-sm text-fg-muted">
          听一句 → 立刻模仿语音语调 → 点「跟读」看跟读匹配度。追节奏和连读，不逐词念。
        </p>
        <p className="mt-1 mb-2 text-meta text-fg-dim">
          跟读匹配度只反映识别器听清了多少词，不评判口音或发音质量。
        </p>
        {!sttOk && (
          <Callout tone="warning" className="mb-2" icon={<MicOff size={16} className="text-fg-muted" />}>
            当前浏览器不支持语音识别，建议用 Chrome / Edge；仍可跟读练习。
          </Callout>
        )}
        <RowGroup>
          {s.shadowing.map((sh, i) => (
            <ShadowRow key={i} text={sh.text} tip={sh.tip} first={i === 0} sttOk={sttOk} />
          ))}
        </RowGroup>

        <SectionLabel>情景对话（角色扮演）</SectionLabel>
        <div className="rounded-lg border border-border p-4">
          {s.miniDialogue.map((d, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1.5">
              <span className="min-w-6 text-sm font-semibold text-fg">{d.speaker}:</span>
              <span className="flex-1 text-body text-fg-secondary">{d.line}</span>
              <SpeakButton text={d.line} />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => speak(s.miniDialogue.map((d) => d.line).join('. '))}
          >
            <Play size={14} /> 播放整段对话
          </Button>
        </div>

        <SectionLabel>开口任务</SectionLabel>
        <Callout tone="accent">
          <p className="text-body text-fg">{s.speakingTask}</p>
          <p className="mt-1.5 text-meta text-fg-muted">录下自己的回答，对比模仿。坚持“每天开口说”是流利的关键。</p>
        </Callout>

        <BlockFooter done={done} onComplete={onComplete} onUndo={onUndo} />
      </CardBody>
    </Card>
  )
}
