import { useEffect, useState, type CSSProperties } from 'react'
import { AlertCircle, Mic, Sparkles, Loader2 } from 'lucide-react'
import type { DayLesson } from '../../types'
import { prefetchSpeak, recognizeOnce, scorePronunciation, sttSupported } from '../../lib/speech'
import { azureAvailable, azureAssess, type PronScore } from '../../lib/azureSpeech'
import { cfVoiceAvailable, cfRecordAndTranscribe, stopCfRecording } from '../../lib/cfSpeech'
import { aiCoach, AIError, type LessonCtx } from '../../lib/ai'
import { SpeakButton, RowGroup, BlockHead } from '../shared'
import { AiGate, ConversationPanel } from '../ai'
import { Button, Callout, Collapse, Stepper } from '../ui'
import { cn } from '../../lib/utils'

function ctxOf(l: DayLesson): LessonCtx {
  return { day: l.day, theme: l.theme, title_en: l.title_en, grammar: l.grammarNote?.point_en, level: 'A2-B1' }
}

function ScoreChip({ label, score, style }: { label: string; score: number; style?: CSSProperties }) {
  const cls = score >= 80 ? 'text-fg' : score >= 55 ? 'text-fg-secondary' : 'text-danger'
  return (
    <span className="animate-in-up inline-flex items-baseline gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5" style={style}>
      <span className="text-label text-fg-muted">{label}</span>
      <span className={cn('t-tab text-sm font-semibold', cls)}>{score}</span>
    </span>
  )
}

// ===== Shadowing hero — one line at a time, big record orb, big score =====
function ShadowHero({ text, tip, sttOk, lesson }: { text: string; tip: string; sttOk: boolean; lesson: DayLesson }) {
  const premium = azureAvailable()
  const cfPath = !premium && cfVoiceAvailable() // only the CF recorder can be stopped mid-take
  const canRecord = premium || cfVoiceAvailable() || sttOk
  const [rec, setRec] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [azure, setAzure] = useState<PronScore | null>(null)
  const [coach, setCoach] = useState<string | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)

  // Warm the line's audio on mount — the speaker taps play instantly.
  useEffect(() => { prefetchSpeak(text) }, [text])

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

  // Tap while recording = finish the take early (CF path); otherwise start.
  const orbTap = () => {
    if (rec) { if (cfPath) stopCfRecording(); return }
    record()
  }

  const getCoach = async () => {
    if (!azure) return
    setCoachBusy(true)
    try { const { reply } = await aiCoach(text, azure, ctxOf(lesson)); setCoach(reply) }
    catch (e) { setCoach(e instanceof AIError ? e.message : '教练暂时不可用') }
    finally { setCoachBusy(false) }
  }

  return (
    <div className="hero-card overflow-hidden rounded-xl border border-border-strong">
      <BlockHead tag="跟读" right={<SpeakButton text={text} />} />

      <div className="flex flex-col items-center px-6 pb-7 pt-6 text-center">
        <div className="animate-in-up text-h1 font-semibold leading-[1.45] text-fg">{text}</div>
        {tip && <div className="mt-2 text-sm text-fg-muted">{tip}</div>}

        {/* big record orb — doubles as the stop control while recording */}
        <div className="relative my-6 h-24 w-24">
          {rec && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={orbTap}
            disabled={!canRecord || (rec && !cfPath)}
            aria-label={rec ? (cfPath ? '结束录音' : '录音中') : '跟读'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-45',
              rec ? 'border-red bg-red-soft text-red' : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {rec ? <span className="pulse-red h-5 w-5 rounded-full bg-red" /> : <Mic size={30} />}
          </button>
        </div>
        <div className="label-nd">
          {!canRecord ? '此浏览器不支持录音 · 建议 Chrome/Edge' : rec ? '听着… 点击结束' : '点击跟读'}
        </div>

        {/* score — big */}
        {score !== null && !azure && (
          <div className="animate-in-up mt-5 w-full">
            <div className="t-doto animate-slam text-[44px] font-semibold leading-none text-fg">{score}</div>
            <div className="label-nd mt-1.5">匹配度</div>
            {heard && <div className="mt-2 text-sm text-fg-muted">听到：{heard}</div>}
          </div>
        )}
        {azure && (
          <div className="animate-in-up mt-5 w-full">
            <div className="t-doto animate-slam text-[44px] font-semibold leading-none text-fg">{azure.pronunciation}</div>
            <div className="label-nd mt-1.5">发音总分</div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {([
                ['准确', azure.accuracy],
                ['流利', azure.fluency],
                ...(azure.prosody != null ? [['韵律', azure.prosody] as [string, number]] : []),
              ] as [string, number][]).map(([lb, sc], i) => (
                <ScoreChip key={lb} label={lb} score={sc} style={{ animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
            {azure.words.some((w) => w.errorType !== 'None' || w.accuracy < 70) && (
              <div className="mt-3 flex flex-wrap justify-center gap-1 text-body-lg">
                {azure.words.map((w, i) => (
                  <span
                    key={i}
                    className={cn('animate-in-up rounded-sm px-1', w.errorType !== 'None' || w.accuracy < 60 ? 'bg-danger-soft text-danger' : w.accuracy < 80 ? 'text-fg-secondary' : 'text-fg')}
                    style={{ animationDelay: `${i * 50}ms` }}
                    title={`${w.accuracy} · ${w.errorType}`}
                  >
                    {w.word}
                  </span>
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

export default function SpeakingBlock({ lesson }: { lesson: DayLesson }) {
  const s = lesson.speaking
  const sttOk = sttSupported()
  const [si, setSi] = useState(0)
  const shadow = s.shadowing
  const cur = shadow[si]
  const scenario = s.miniDialogue.length > 0
    ? `${lesson.theme} — e.g. ${s.miniDialogue.map((d) => d.line).slice(0, 3).join(' / ')}`
    : lesson.theme

  return (
    <div className="space-y-4">
      {/* ===== HERO shadowing ===== */}
      {cur && <ShadowHero key={si} text={cur.text} tip={cur.tip} sttOk={sttOk} lesson={lesson} />}

      <Stepper idx={si} total={shadow.length} onStep={(d) => setSi((p) => p + d)} />

      {/* speaking task — the day's action, first */}
      <Callout tone="accent">
        <div className="label-nd mb-1.5">口语任务</div>
        <p className="text-body text-fg">{s.speakingTask}</p>
        <p className="mt-1.5 text-meta text-fg-muted">录下自己的回答，对比模仿。坚持"每天开口说"是流利的关键。</p>
      </Callout>

      {/* AI partner */}
      <Collapse label="AI 陪练" hint="和 AI 用今天的情景聊，实时纠错">
        <div className="p-4">
          <AiGate><ConversationPanel lesson={ctxOf(lesson)} scenario={scenario} /></AiGate>
        </div>
      </Collapse>

      {/* dialogue */}
      <Collapse label="情景对话" hint={s.miniDialogue[0]?.line}>
        <RowGroup>
          {s.miniDialogue.map((d, i) => (
            <div key={i} className={cn('flex items-start gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-hover', i > 0 && 'border-t border-border-soft')}>
              <span className="min-w-6 text-sm font-semibold text-fg">{d.speaker}:</span>
              <span className="flex-1 text-body text-fg-secondary">{d.line}</span>
              <SpeakButton text={d.line} />
            </div>
          ))}
        </RowGroup>
      </Collapse>

      {/* target sounds */}
      <Collapse label="目标音" count={s.targetSounds.length} hint={s.targetSounds[0]}>
        <ul className="space-y-1.5 p-5">
          {s.targetSounds.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-fg-secondary"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-muted" />{t}</li>
          ))}
        </ul>
      </Collapse>
    </div>
  )
}
