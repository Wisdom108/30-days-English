import { useState } from 'react'
import { AlertCircle, Mic, MicOff, Play, Sparkles, Loader2 } from 'lucide-react'
import type { DayLesson } from '../../types'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../lib/speech'
import { azureAvailable, azureAssess, type PronScore } from '../../lib/azureSpeech'
import { cfVoiceAvailable, cfRecordAndTranscribe } from '../../lib/cfSpeech'
import { aiCoach, AIError, type LessonCtx } from '../../lib/ai'
import { SpeakButton, RowGroup } from '../shared'
import { AiGate, ConversationPanel } from '../ai'
import { Button, Card, CardBody, Callout, SectionLabel } from '../ui'
import { cn } from '../../lib/utils'
import BlockFooter from './BlockFooter'

function ctxOf(l: DayLesson): LessonCtx {
  return { day: l.day, theme: l.theme, title_en: l.title_en, grammar: l.grammarNote?.point_en, level: 'A2-B1' }
}

function ScoreChip({ label, score }: { label: string; score: number }) {
  const cls =
    score >= 80 ? 'text-fg' : score >= 55 ? 'text-fg-secondary' : 'text-danger'
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5">
      <span className="text-label text-fg-muted">{label}</span>
      <span className={cn('t-num text-sm font-semibold', cls)}>{score}</span>
    </span>
  )
}

function ShadowRow({
  text,
  tip,
  first,
  sttOk,
  lesson,
}: {
  text: string
  tip: string
  first: boolean
  sttOk: boolean
  lesson: DayLesson
}) {
  const premium = azureAvailable()
  const [rec, setRec] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // browser fallback
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  // azure premium
  const [azure, setAzure] = useState<PronScore | null>(null)
  const [coach, setCoach] = useState<string | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)

  const record = async () => {
    setRec(true)
    setError(null)
    setScore(null)
    setHeard(null)
    setAzure(null)
    setCoach(null)
    try {
      if (premium) {
        setAzure(await azureAssess(text))
      } else if (cfVoiceAvailable()) {
        // Cloudflare Whisper: record + transcribe, then word-match score.
        const transcript = await cfRecordAndTranscribe()
        setHeard(transcript)
        setScore(scorePronunciation(text, transcript))
      } else {
        const { transcript } = await recognizeOnce()
        setHeard(transcript)
        setScore(scorePronunciation(text, transcript))
      }
    } catch (e) {
      setError(e instanceof Error && e.message.includes('登录') ? '请先登录以使用发音评测' : '没听清，请再试一次')
    } finally {
      setRec(false)
    }
  }

  const getCoach = async () => {
    if (!azure) return
    setCoachBusy(true)
    try {
      const { reply } = await aiCoach(text, azure, ctxOf(lesson))
      setCoach(reply)
    } catch (e) {
      setCoach(e instanceof AIError ? e.message : '教练暂时不可用')
    } finally {
      setCoachBusy(false)
    }
  }

  return (
    <div className={cn('px-3.5 py-3 transition-colors hover:bg-hover', !first && 'border-t border-border-soft')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 text-body-lg text-fg">{text}</span>
        <div className="flex items-center gap-1">
          <SpeakButton text={text} />
          <SpeakButton text={text} slow />
          {/* Record is the block's primary action → raised to a bordered button;
              active state pulses red per the recording-affordance contract. */}
          <Button
            variant="secondary"
            size="sm"
            className={cn('h-9 gap-1.5 px-3', rec && 'border-red/50 text-red')}
            onClick={record}
            disabled={rec || (!premium && !cfVoiceAvailable() && !sttOk)}
          >
            {rec ? (
              <span className="pulse-red inline-block h-2 w-2 shrink-0 rounded-full bg-red" />
            ) : (
              <Mic size={14} />
            )}
            {rec ? '听着…' : '跟读'}
          </Button>
        </div>
      </div>
      <div className="mt-1.5 text-meta text-fg-muted">{tip}</div>

      {/* Premium: Azure phoneme-level assessment */}
      {azure && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ScoreChip label="发音" score={azure.pronunciation} />
            <ScoreChip label="准确" score={azure.accuracy} />
            <ScoreChip label="流利" score={azure.fluency} />
            {azure.prosody != null && <ScoreChip label="韵律" score={azure.prosody} />}
          </div>
          {azure.words.some((w) => w.errorType !== 'None' || w.accuracy < 70) && (
            <div className="flex flex-wrap gap-1 text-sm">
              {azure.words.map((w, i) => (
                <span
                  key={i}
                  className={cn(
                    'rounded-sm px-1',
                    w.errorType !== 'None' || w.accuracy < 60
                      ? 'bg-danger-soft text-danger'
                      : w.accuracy < 80
                      ? 'text-fg-secondary'
                      : 'text-fg',
                  )}
                  title={`${w.accuracy} · ${w.errorType}`}
                >
                  {w.word}
                </span>
              ))}
            </div>
          )}
          {!coach ? (
            <Button variant="ghost" size="sm" disabled={coachBusy} onClick={getCoach}>
              {coachBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-fg-muted" />}
              问 AI 发音教练
            </Button>
          ) : (
            <Callout tone="accent" icon={<Sparkles size={14} className="text-fg-muted" />}>
              {coach}
            </Callout>
          )}
        </div>
      )}

      {/* Browser fallback: recognizer word-match */}
      {heard && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-meta text-fg-muted">听到：{heard}</span>
          {score !== null && (
            <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5">
              <span className="t-num text-sm font-semibold text-fg">{score}</span>
              <span className="text-label text-fg-muted">匹配</span>
            </span>
          )}
        </div>
      )}
      {error && (
        <Callout tone="red" role="alert" className="mt-2" icon={<AlertCircle size={16} className="text-red" />}>
          {error}
        </Callout>
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
  const premium = azureAvailable()
  const sttOk = sttSupported()
  const scenario =
    s.miniDialogue.length > 0
      ? `${lesson.theme} — e.g. ${s.miniDialogue.map((d) => d.line).slice(0, 3).join(' / ')}`
      : lesson.theme

  return (
    <Card>
      <CardBody>
        <h2 className="text-h2 font-semibold">口语 · 影子跟读</h2>

        <SectionLabel>目标音</SectionLabel>
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
          听一句 → 立刻模仿语音语调 → 点「跟读」{premium ? '获取音素级发音评测' : '看跟读匹配度'}。追节奏和连读，不逐词念。
        </p>
        {premium ? (
          <p className="mt-1 mb-2 text-meta text-fg-muted">
            由 Azure 神经语音评测：准确度 / 流利度 / 完整度 / 韵律，逐词标出弱点，可让 AI 教练给针对性建议。
          </p>
        ) : cfVoiceAvailable() ? (
          <p className="mt-1 mb-2 text-meta text-fg-muted">
            由 Cloudflare Whisper 识别你的跟读、算匹配度（听清了多少词）；配置 Azure 后可升级为音素级发音评测。
          </p>
        ) : (
          <p className="mt-1 mb-2 text-meta text-fg-muted">
            跟读匹配度只反映识别器听清了多少词，不评判口音；配置 Azure 后可用真发音评测。
          </p>
        )}
        {!premium && !cfVoiceAvailable() && !sttOk && (
          <Callout tone="warning" className="mb-2" icon={<MicOff size={16} className="text-fg-muted" />}>
            当前浏览器不支持语音识别，建议用 Chrome / Edge；仍可跟读练习。
          </Callout>
        )}
        <RowGroup>
          {s.shadowing.map((sh, i) => (
            <ShadowRow key={i} text={sh.text} tip={sh.tip} first={i === 0} sttOk={sttOk} lesson={lesson} />
          ))}
        </RowGroup>

        <SectionLabel>情景对话</SectionLabel>
        <RowGroup>
          {s.miniDialogue.map((d, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-hover',
                i > 0 && 'border-t border-border-soft',
              )}
            >
              <span className="min-w-6 text-sm font-semibold text-fg">{d.speaker}:</span>
              <span className="flex-1 text-body text-fg-secondary">{d.line}</span>
              <SpeakButton text={d.line} />
            </div>
          ))}
        </RowGroup>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => speak(s.miniDialogue.map((d) => d.line).join('. '))}
        >
          <Play size={14} /> 播放整段对话
        </Button>

        <SectionLabel>AI 陪练</SectionLabel>
        <AiGate>
          <ConversationPanel lesson={ctxOf(lesson)} scenario={scenario} />
        </AiGate>

        <SectionLabel>口语任务</SectionLabel>
        <Callout tone="accent">
          <p className="text-body text-fg">{s.speakingTask}</p>
          <p className="mt-1.5 text-meta text-fg-muted">录下自己的回答，对比模仿。坚持“每天开口说”是流利的关键。</p>
        </Callout>

        <BlockFooter done={done} onComplete={onComplete} onUndo={onUndo} />
      </CardBody>
    </Card>
  )
}
