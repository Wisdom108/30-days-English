import { useState, type ReactNode } from 'react'
import {
  AlertCircle, Mic, MicOff, Play, Sparkles, Loader2, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react'
import type { DayLesson } from '../../types'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../lib/speech'
import { azureAvailable, azureAssess, type PronScore } from '../../lib/azureSpeech'
import { cfVoiceAvailable, cfRecordAndTranscribe } from '../../lib/cfSpeech'
import { aiCoach, AIError, type LessonCtx } from '../../lib/ai'
import { SpeakButton, RowGroup } from '../shared'
import { AiGate, ConversationPanel } from '../ai'
import { Button, Callout } from '../ui'
import { cn } from '../../lib/utils'

function ctxOf(l: DayLesson): LessonCtx {
  return { day: l.day, theme: l.theme, title_en: l.title_en, grammar: l.grammarNote?.point_en, level: 'A2-B1' }
}

function Collapse({ label, count, children, defaultOpen }: { label: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
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

function ScoreChip({ label, score }: { label: string; score: number }) {
  const cls = score >= 80 ? 'text-fg' : score >= 55 ? 'text-fg-secondary' : 'text-danger'
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5">
      <span className="text-label text-fg-muted">{label}</span>
      <span className={cn('t-tab text-sm font-semibold', cls)}>{score}</span>
    </span>
  )
}

// ===== Shadowing hero — one line at a time, big record orb, big score =====
function ShadowHero({ text, tip, idx, total, sttOk, lesson }: { text: string; tip: string; idx: number; total: number; sttOk: boolean; lesson: DayLesson }) {
  const premium = azureAvailable()
  const canRecord = premium || cfVoiceAvailable() || sttOk
  const [rec, setRec] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [azure, setAzure] = useState<PronScore | null>(null)
  const [coach, setCoach] = useState<string | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)

  const record = async () => {
    setRec(true); setError(null); setScore(null); setHeard(null); setAzure(null); setCoach(null)
    try {
      if (premium) setAzure(await azureAssess(text))
      else if (cfVoiceAvailable()) { const t = await cfRecordAndTranscribe(); setHeard(t); setScore(scorePronunciation(text, t)) }
      else { const { transcript } = await recognizeOnce(); setHeard(transcript); setScore(scorePronunciation(text, transcript)) }
    } catch (e) {
      setError(e instanceof Error && e.message.includes('登录') ? '请先登录以使用发音评测' : '没听清，请再试一次')
    } finally { setRec(false) }
  }

  const getCoach = async () => {
    if (!azure) return
    setCoachBusy(true)
    try { const { reply } = await aiCoach(text, azure, ctxOf(lesson)); setCoach(reply) }
    catch (e) { setCoach(e instanceof AIError ? e.message : '教练暂时不可用') }
    finally { setCoachBusy(false) }
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-border-strong"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #17171a 0%, #0d0d0f 62%)' }}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="label-nd">跟读 · <span className="t-tab text-fg-secondary">{idx + 1}/{total}</span></span>
        <div className="flex items-center gap-1">
          <SpeakButton text={text} />
          <SpeakButton text={text} slow />
        </div>
      </div>

      <div className="flex flex-col items-center px-6 pb-7 pt-6 text-center">
        <div className="t-serif text-[23px] font-semibold leading-[1.45] text-fg">{text}</div>
        {tip && <div className="mt-2 text-sm text-fg-muted">{tip}</div>}

        {/* big record orb */}
        <div className="relative my-6 h-24 w-24">
          {rec && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={record}
            disabled={rec || !canRecord}
            aria-label={rec ? '录音中' : '跟读'}
            className={cn(
              'absolute inset-0 grid place-items-center rounded-full border-2 transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-45',
              rec ? 'border-red bg-red-soft text-red' : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {rec ? <span className="pulse-red h-5 w-5 rounded-full bg-red" /> : <Mic size={30} />}
          </button>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">
          {rec ? '听着…' : canRecord ? (premium ? '点击 · 音素级评测' : '点击跟读 · 看匹配度') : '跟读练习'}
        </div>

        {/* score — big */}
        {score !== null && !azure && (
          <div className="mt-5 w-full animate-in-up">
            <div className="t-doto text-[44px] font-semibold leading-none text-fg">{score}</div>
            <div className="label-nd mt-1.5">匹配度</div>
            {heard && <div className="mt-2 text-sm text-fg-muted">听到：{heard}</div>}
          </div>
        )}
        {azure && (
          <div className="mt-5 w-full animate-in-up">
            <div className="t-doto text-[44px] font-semibold leading-none text-fg">{azure.pronunciation}</div>
            <div className="label-nd mt-1.5">发音总分</div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <ScoreChip label="准确" score={azure.accuracy} />
              <ScoreChip label="流利" score={azure.fluency} />
              {azure.prosody != null && <ScoreChip label="韵律" score={azure.prosody} />}
            </div>
            {azure.words.some((w) => w.errorType !== 'None' || w.accuracy < 70) && (
              <div className="mt-3 flex flex-wrap justify-center gap-1 text-body-lg">
                {azure.words.map((w, i) => (
                  <span key={i} className={cn('rounded-sm px-1', w.errorType !== 'None' || w.accuracy < 60 ? 'bg-danger-soft text-danger' : w.accuracy < 80 ? 'text-fg-secondary' : 'text-fg')} title={`${w.accuracy} · ${w.errorType}`}>{w.word}</span>
                ))}
              </div>
            )}
            {!coach ? (
              <Button variant="ghost" size="sm" className="mt-3" disabled={coachBusy} onClick={getCoach}>
                {coachBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-fg-muted" />} 问 AI 发音教练
              </Button>
            ) : (
              <Callout tone="accent" className="mt-3 text-left" icon={<Sparkles size={14} className="text-fg-muted" />}>{coach}</Callout>
            )}
          </div>
        )}
        {error && <Callout tone="red" role="alert" className="mt-4 text-left" icon={<AlertCircle size={16} className="text-red" />}>{error}</Callout>}
      </div>
    </div>
  )
}

export default function SpeakingBlock({
  lesson,
}: {
  lesson: DayLesson
  done?: boolean
  onComplete?: () => void
  onUndo?: () => void
}) {
  const s = lesson.speaking
  const premium = azureAvailable()
  const sttOk = sttSupported()
  const [si, setSi] = useState(0)
  const shadow = s.shadowing
  const cur = shadow[si]
  const scenario = s.miniDialogue.length > 0
    ? `${lesson.theme} — e.g. ${s.miniDialogue.map((d) => d.line).slice(0, 3).join(' / ')}`
    : lesson.theme

  return (
    <div className="space-y-4">
      {!premium && !cfVoiceAvailable() && !sttOk && (
        <Callout tone="warning" icon={<MicOff size={16} className="text-fg-muted" />}>
          当前浏览器不支持语音识别，建议用 Chrome / Edge；仍可跟读练习。
        </Callout>
      )}

      {/* ===== HERO shadowing ===== */}
      {cur && <ShadowHero key={si} text={cur.text} tip={cur.tip} idx={si} total={shadow.length} sttOk={sttOk} lesson={lesson} />}

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" disabled={si === 0} onClick={() => setSi((p) => p - 1)}><ChevronLeft size={15} /> 上一句</Button>
        <div className="flex gap-1.5">
          {shadow.map((_, idx) => (
            <span key={idx} className={cn('h-1.5 w-1.5 rounded-[2px]', idx === si ? 'bg-red' : idx < si ? 'bg-fg' : 'border border-border-strong')} />
          ))}
        </div>
        <Button variant="secondary" size="sm" disabled={si === shadow.length - 1} onClick={() => setSi((p) => p + 1)}>下一句 <ChevronRight size={15} /></Button>
      </div>

      {/* target sounds */}
      <Collapse label="目标音" count={s.targetSounds.length}>
        <ul className="space-y-1.5 p-5">
          {s.targetSounds.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-fg-secondary"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-muted" />{t}</li>
          ))}
        </ul>
      </Collapse>

      {/* dialogue */}
      <Collapse label="情景对话">
        <RowGroup>
          {s.miniDialogue.map((d, i) => (
            <div key={i} className={cn('flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-hover', i > 0 && 'border-t border-border-soft')}>
              <span className="min-w-6 text-sm font-semibold text-fg">{d.speaker}:</span>
              <span className="flex-1 text-body text-fg-secondary">{d.line}</span>
              <SpeakButton text={d.line} />
            </div>
          ))}
        </RowGroup>
        <div className="p-3">
          <Button variant="secondary" size="sm" onClick={() => speak(s.miniDialogue.map((d) => d.line).join('. '))}><Play size={14} /> 播放整段对话</Button>
        </div>
      </Collapse>

      {/* AI partner */}
      <Collapse label="AI 陪练">
        <div className="p-4">
          <AiGate><ConversationPanel lesson={ctxOf(lesson)} scenario={scenario} /></AiGate>
        </div>
      </Collapse>

      {/* speaking task */}
      <Callout tone="accent">
        <div className="label-nd mb-1.5">口语任务</div>
        <p className="text-body text-fg">{s.speakingTask}</p>
        <p className="mt-1.5 text-meta text-fg-muted">录下自己的回答，对比模仿。坚持"每天开口说"是流利的关键。</p>
      </Callout>
    </div>
  )
}
