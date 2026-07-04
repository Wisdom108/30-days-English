import { useEffect, useRef, useState } from 'react'
import { Mic, Volume2 } from 'lucide-react'
import type { LessonCtx } from '../../../lib/ai'
import { cfRecordAndTranscribe, cfVoiceAvailable, stopCfRecording } from '../../../lib/cfSpeech'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../../lib/speech'
import { zaizaiChat, type DrillCardPayload } from '../../../lib/zaizai'
import { cn } from '../../../lib/utils'

// 跟读挑战卡:听目标句 → 录音 → 匹配度打分 → 在在一句话点评(尽力而为)。
export default function DrillCard({ data, lesson }: { data: DrillCardPayload; lesson: LessonCtx }) {
  const cfPath = cfVoiceAvailable() // only the CF recorder can be stopped mid-take
  const canRecord = cfPath || sttSupported()
  const [rec, setRec] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Synchronous ownership flag for the CF recorder singleton: set before any
  // await (double-tap can't start two takes) and read by the unmount cleanup
  // so leaving the feed mid-take releases the mic.
  const takeRef = useRef(false)

  useEffect(
    () => () => {
      if (takeRef.current) stopCfRecording()
    },
    [],
  )

  const record = async () => {
    if (takeRef.current || rec) {
      if (cfPath) stopCfRecording() // tap-to-stop (also swallows an accidental double-tap)
      return
    }
    takeRef.current = true
    setRec(true)
    setScore(null)
    setHeard(null)
    setVerdict(null)
    setError(null)
    try {
      const t = (cfPath ? await cfRecordAndTranscribe() : (await recognizeOnce()).transcript).trim()
      if (!t) throw new Error('no-speech') // Whisper heard noise, not words — nothing to score
      const s = scorePronunciation(data.text, t)
      setHeard(t)
      setScore(s)
      // 在在 one-line verdict — best-effort, stays silent on failure.
      zaizaiChat(
        [{ role: 'user', content: `我跟读了 "${data.text}",说成了 "${t}",匹配度 ${s}/100。用一句话点评我的跟读。` }],
        lesson,
      )
        .then(({ reply }) => setVerdict(reply))
        .catch(() => {})
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(
        msg.includes('登录')
          ? '请先登录以使用录音评分'
          : msg === 'recording-busy'
            ? '上一段录音还没结束,稍等一下'
            : '没听清,再试一次?',
      )
    } finally {
      takeRef.current = false
      setRec(false)
    }
  }

  return (
    <div className="glass w-full max-w-[88%] rounded-xl p-4">
      <div className="label-nd">跟读挑战</div>
      <button onClick={() => speak(data.text)} className="press group mt-2 flex w-full items-start gap-2 text-left">
        <Volume2 size={14} className="mt-1 shrink-0 text-fg-dim transition-colors group-hover:text-brand" />
        <span className="text-body-lg font-medium leading-snug text-fg">{data.text}</span>
      </button>
      {data.tip && <div className="mt-1.5 text-meta text-fg-muted">{data.tip}</div>}

      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0">
          {rec && <span className="pulse-red absolute -inset-1.5 rounded-full border border-red/40" />}
          <button
            onClick={record}
            disabled={!canRecord || (rec && !cfPath)}
            aria-label={rec ? (cfPath ? '结束录音' : '录音中') : '跟读'}
            className={cn(
              'press absolute inset-0 grid place-items-center rounded-full border transition-colors disabled:opacity-45',
              rec ? 'border-red bg-red-soft text-red' : 'border-border-strong bg-surface text-fg hover:border-fg',
            )}
          >
            {rec ? <span className="pulse-red h-4 w-4 rounded-full bg-red" /> : <Mic size={18} />}
          </button>
        </div>
        {score !== null ? (
          <div className="min-w-0">
            <span className="t-doto animate-slam inline-block text-[30px] font-semibold leading-none text-fg">{score}</span>
            <span className="label-nd ml-1.5">匹配度</span>
            {heard && <div className="mt-0.5 truncate text-meta text-fg-muted">听到:{heard}</div>}
          </div>
        ) : (
          <span className="label-nd">
            {!canRecord ? '此浏览器不支持录音' : rec ? (cfPath ? '听着… 点击结束' : '听着…') : error || '点麦克风开始跟读'}
          </span>
        )}
      </div>

      {verdict && <div className="animate-in-up mt-2.5 text-sm leading-relaxed text-fg-secondary">{verdict}</div>}
    </div>
  )
}
