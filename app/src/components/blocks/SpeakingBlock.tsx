import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { AlertCircle, Mic, Sparkles, Loader2 } from 'lucide-react'
import type { DayLesson } from '../../types'
import { prefetchSpeak } from '../../lib/speech'
import { scoreShadow, type ShadowResult } from '../../lib/shadowScore'
import { azureAvailable, azureAssess, type PronScore } from '../../lib/azureSpeech'
import { cfVoiceAvailable, stopCfRecording } from '../../lib/cfSpeech'
import { recorderErrorMessage, useRecorder } from '../../lib/useRecorder'
import { aiCoach, AIError, type LessonCtx } from '../../lib/ai'
import { realtimeAvailable, voiceAgentAvailable, grokRealtimeAvailable } from '../../lib/caps'
import { SpeakButton, BlockHead, DialoguePlayer, ShadowReadout } from '../shared'
import { AiGate, ConversationPanel } from '../ai'
import { Button, Callout, Collapse, Skeleton, Stepper } from '../ui'
import { cn } from '../../lib/utils'

// Realtime tutors load on demand (only when the Speaking block renders the AI
// partner) — keeps the heavy voice stacks out of the main bundle.
const CFLiveTutor = lazy(() => import('../CFLiveTutor'))
const GrokLiveTutor = lazy(() => import('../GrokLiveTutor'))
const LiveTutor = lazy(() => import('../LiveTutor'))
const VoiceLoop = lazy(() => import('../VoiceLoop'))

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
function ShadowHero({ text, tip, lesson }: { text: string; tip: string; lesson: DayLesson }) {
  const premium = azureAvailable()
  const recorder = useRecorder() // CF/browser takes; Azure records via its own SDK below
  const stoppable = !premium && recorder.cfPath // only the CF recorder can be stopped mid-take
  const canRecord = premium || recorder.canRecord
  const [azRec, setAzRec] = useState(false)
  const rec = azRec || recorder.rec
  const [error, setError] = useState<string | null>(null)
  const [shadow, setShadow] = useState<ShadowResult | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [azure, setAzure] = useState<PronScore | null>(null)
  const [coach, setCoach] = useState<string | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)

  // Warm the line's audio on mount — the speaker taps play instantly.
  useEffect(() => { prefetchSpeak(text) }, [text])

  const record = async () => {
    setError(null); setShadow(null); setHeard(null); setAzure(null); setCoach(null)
    try {
      if (premium) {
        setAzRec(true)
        try { setAzure(await azureAssess(text)) } finally { setAzRec(false) }
      } else {
        const t = await recorder.take()
        if (!t) return
        setHeard(t)
        setShadow(scoreShadow(text, t))
      }
    } catch (e) {
      setError(recorderErrorMessage(e))
    }
  }

  // Tap while recording = finish the take early (CF path); otherwise start.
  const orbTap = () => {
    if (rec) { if (stoppable) stopCfRecording(); return }
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
    <div className="hero-card overflow-hidden rounded-xl">
      <BlockHead tag="跟读" right={<SpeakButton text={text} />} />

      <div className="flex flex-col items-center px-6 pb-7 pt-6 text-center">
        <div className="animate-in-up text-h1 font-semibold leading-[1.45] text-fg">{text}</div>
        {tip && <div className="mt-2 text-sm text-fg-muted">{tip}</div>}

        {/* big record orb — doubles as the stop control while recording */}
        <div className="relative my-6 h-24 w-24">
          {rec && <span className="pulse-red absolute -inset-2.5 rounded-full border border-red/40" />}
          <button
            onClick={orbTap}
            disabled={!canRecord || (rec && !stoppable)}
            aria-label={rec ? (stoppable ? '结束录音' : '录音中') : '开始跟读录音'}
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

        {/* score — per-word LCS alignment: missed words light up on the reference */}
        {shadow !== null && !azure && (
          <div className="animate-in-up mt-5 w-full">
            <ShadowReadout result={shadow} />
            {heard && !shadow.noSpeech && <div className="mt-2 text-sm text-fg-muted">听到：{heard}</div>}
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
  const [si, setSi] = useState(0)
  const shadow = s.shadowing
  const cur = shadow[si]
  const scenario = s.miniDialogue.length > 0
    ? `${lesson.theme} — e.g. ${s.miniDialogue.map((d) => d.line).slice(0, 3).join(' / ')}`
    : lesson.theme

  return (
    <div className="space-y-4">
      {/* ===== HERO shadowing ===== */}
      {cur && <ShadowHero key={si} text={cur.text} tip={cur.tip} lesson={lesson} />}

      <Stepper idx={si} total={shadow.length} onStep={(d) => setSi((p) => p + d)} />

      {/* speaking task — the day's action, first */}
      <Callout tone="accent">
        <div className="label-nd mb-1.5">口语任务</div>
        <p className="text-body text-fg">{s.speakingTask}</p>
        <p className="mt-1.5 text-meta text-fg-muted">录下自己的回答，对比模仿。坚持"每天开口说"是流利的关键。</p>
      </Callout>

      {/* AI partner — first-class, always visible (no longer buried in a fold) */}
      <div className="glass-card rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-fg" />
          <span className="label-nd">AI 陪练 · 实时语音</span>
          <span className="ml-auto flex items-center gap-1 text-meta text-fg-muted">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />可随时打断
          </span>
        </div>
        <AiPartner lesson={ctxOf(lesson)} scenario={scenario} />
      </div>

      {/* dialogue — two distinct voices so A/B sound like two people */}
      <Collapse label="情景对话" hint={s.miniDialogue[0]?.line}>
        <div className="p-3.5">
          <DialoguePlayer lines={s.miniDialogue} />
        </div>
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

// AI conversation partner. When the Worker has a Grok key, let the learner pick
// between the FREE Cloudflare tutor and Grok's native realtime (paid). Otherwise
// fall back: CF Agents voice > OpenAI Realtime > CF turn-loop > text.
// Exported so the dedicated AI hub page can feature it as a first-class citizen.
export function AiPartner({ lesson, scenario }: { lesson: LessonCtx; scenario?: string }) {
  const cfAgent = voiceAgentAvailable()
  const grok = grokRealtimeAvailable()
  const openai = realtimeAvailable()
  const cfVoice = cfVoiceAvailable()
  const [provider, setProvider] = useState<'cf' | 'grok'>('cf')

  const toggle = grok && cfAgent && (
    <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {([
        ['cf', '免费 · 即时'],
        ['grok', '实时 · Grok'],
      ] as const).map(([v, label]) => (
        <button
          key={v}
          onClick={() => setProvider(v)}
          className={cn('press min-h-9 rounded-sm text-sm font-medium transition-colors', provider === v ? 'bg-elevated text-fg shadow-rest' : 'text-fg-muted hover:text-fg')}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const panel =
    grok && provider === 'grok' ? <GrokLiveTutor lesson={lesson} scenario={scenario} />
    : cfAgent ? <CFLiveTutor lesson={lesson} />
    : grok ? <GrokLiveTutor lesson={lesson} scenario={scenario} />
    : openai ? <LiveTutor lesson={lesson} />
    : cfVoice ? <VoiceLoop lesson={lesson} scenario={scenario} />
    : <AiGate><ConversationPanel lesson={lesson} scenario={scenario} /></AiGate>

  return (
    <div>
      {toggle}
      <Suspense fallback={<Skeleton className="h-24 rounded-xl" />}>{panel}</Suspense>
    </div>
  )
}
