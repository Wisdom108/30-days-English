import { useState } from 'react'
import { Mic, Play } from 'lucide-react'
import type { DayLesson } from '../../types'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../lib/speech'
import { SpeakButton } from '../shared'
import { Badge, Button, Card, CardBody, SectionLabel } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? 'bg-success/15 text-success'
      : score >= 55
      ? 'bg-warning/15 text-warning'
      : 'bg-danger/15 text-danger'
  return <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold', cls)}>{score} 分</span>
}

function ShadowRow({ text, tip }: { text: string; tip: string }) {
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [rec, setRec] = useState(false)

  const record = async () => {
    if (!sttSupported()) {
      alert('当前浏览器不支持语音识别，请用 Chrome/Edge。你仍可跟读练习。')
      return
    }
    setRec(true)
    setHeard(null)
    try {
      const { transcript } = await recognizeOnce()
      setHeard(transcript)
      setScore(scorePronunciation(text, transcript))
    } catch {
      setHeard('（没听清，请再试一次）')
      setScore(null)
    } finally {
      setRec(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 text-[15px] text-fg-secondary">{text}</span>
        <div className="flex items-center gap-1">
          <SpeakButton text={text} />
          <SpeakButton text={text} slow />
          <Button size="sm" variant={rec ? 'secondary' : 'primary'} onClick={record} disabled={rec}>
            <Mic size={14} /> {rec ? '听着…' : '跟读'}
          </Button>
        </div>
      </div>
      <div className="mt-1.5 text-[12px] text-fg-dim">💡 {tip}</div>
      {heard && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] text-fg-muted">听到：{heard}</span>
          {score !== null && <ScoreBadge score={score} />}
        </div>
      )}
    </div>
  )
}

export default function SpeakingBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const s = lesson.speaking
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px]">🗣️ 口语 · 影子跟读</h2>
          <Badge variant="warning">🌞 午间 40′ · 重点</Badge>
        </div>

        <SectionLabel>🎯 今日发音重点</SectionLabel>
        <ul className="space-y-1.5">
          {s.targetSounds.map((t, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-fg-secondary">
              <span className="text-brand">•</span>
              {t}
            </li>
          ))}
        </ul>

        <SectionLabel>🔁 影子跟读</SectionLabel>
        <p className="-mt-1 mb-2 text-[13px] text-fg-muted">听一句 → 立刻模仿语音语调 → 点「跟读」让系统识别打分。追节奏和连读，不逐词念。</p>
        <div className="space-y-2">
          {s.shadowing.map((sh, i) => (
            <ShadowRow key={i} text={sh.text} tip={sh.tip} />
          ))}
        </div>

        <SectionLabel>💬 情景对话（角色扮演）</SectionLabel>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          {s.miniDialogue.map((d, i) => (
            <div key={i} className="flex items-start gap-2.5 py-1.5">
              <span className="min-w-6 text-[13px] font-semibold text-brand">{d.speaker}:</span>
              <span className="flex-1 text-[14px] text-fg-secondary">{d.line}</span>
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

        <SectionLabel>🎙️ 开口任务</SectionLabel>
        <div className="rounded-xl border border-brand/25 bg-brand/[0.06] p-4">
          <p className="text-[14px] text-fg-secondary">{s.speakingTask}</p>
          <p className="mt-1.5 text-[12px] text-fg-dim">录下自己的回答，对比模仿。坚持"每天开口说"是流利的关键。</p>
        </div>

        <BlockFooter done={done} onComplete={onComplete} />
      </CardBody>
    </Card>
  )
}
