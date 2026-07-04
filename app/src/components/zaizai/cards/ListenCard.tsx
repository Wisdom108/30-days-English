import { useEffect, useRef, useState } from 'react'
import { Eye, Play, Square } from 'lucide-react'
import { cfSpeak, cfVoiceAvailable } from '../../../lib/cfSpeech'
import { speak, stopSpeaking } from '../../../lib/speech'
import type { ListenCardPayload } from '../../../lib/zaizai'
import { cn } from '../../../lib/utils'

// Fixed pseudo-random bar heights — a waveform look without real analysis.
const BARS = [7, 13, 9, 16, 11, 18, 8, 14, 10, 17, 12, 6, 15, 9, 13, 7]

// 语音气泡卡:先听(neural 优先,系统声兜底),听完再点开原文。
export default function ListenCard({ data }: { data: ListenCardPayload }) {
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(false)
  // Stale-guard: each play attempt gets a token; only the CURRENT attempt may
  // flip `playing` back off, so a superseded play (stop → quick replay) can't
  // clobber the new playback's UI state when its awaited promise settles late.
  const seq = useRef(0)

  // Leaving the feed mid-playback must not leak audio.
  useEffect(() => () => stopSpeaking(), [])

  const play = async () => {
    if (playing) {
      seq.current++ // invalidate the in-flight attempt before it settles
      stopSpeaking()
      setPlaying(false)
      return
    }
    const mySeq = ++seq.current
    setPlaying(true)
    try {
      if (cfVoiceAvailable()) await cfSpeak(data.text)
      else await speak(data.text)
    } catch {
      if (mySeq === seq.current) await speak(data.text).catch(() => {})
    } finally {
      if (mySeq === seq.current) setPlaying(false)
    }
  }

  return (
    <div className="glass w-full max-w-[88%] rounded-xl p-4">
      <div className="label-nd">{data.label || '磨耳朵'} · 听完再看</div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={play}
          aria-label={playing ? '停止' : '播放'}
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-brand-fg"
        >
          {playing ? <Square size={15} /> : <Play size={17} className="ml-0.5" />}
        </button>
        {/* waveform-ish visual — pulses while playing */}
        <div className="flex h-9 flex-1 items-center gap-[3px]" aria-hidden>
          {BARS.map((h, i) => (
            <span
              key={i}
              className={cn('w-1 rounded-full transition-colors', playing ? 'animate-pulse bg-brand' : 'bg-fg-dim')}
              style={{ height: h * 2, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>
      {revealed ? (
        <button onClick={() => speak(data.text)} className="press animate-in-up mt-3 block w-full text-left text-body leading-snug text-fg">
          {data.text}
        </button>
      ) : (
        <button onClick={() => setRevealed(true)} className="press mt-3 flex items-center gap-1.5 text-meta font-medium text-brand">
          <Eye size={13} /> 听完了,看原文
        </button>
      )}
    </div>
  )
}
