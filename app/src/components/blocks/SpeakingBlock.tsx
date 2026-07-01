import { useState } from 'react'
import type { DayLesson } from '../../types'
import { recognizeOnce, scorePronunciation, speak, sttSupported } from '../../lib/speech'
import { SpeakButton } from '../shared'
import BlockFooter from './BlockFooter'

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'score-good' : score >= 55 ? 'score-mid' : 'score-bad'
  return <span className={`score-badge ${cls}`}>{score} 分</span>
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
    <div className="shadow-item">
      <div className="row spread">
        <span className="grow">{text}</span>
        <div className="row" style={{ gap: 6 }}>
          <SpeakButton text={text} />
          <SpeakButton text={text} label="🐢" rate={0.7} />
          <button className="btn-sm" onClick={record} disabled={rec}>
            {rec ? '🎙️ 听着…' : '🎤 跟读'}
          </button>
        </div>
      </div>
      <div className="tip">💡 {tip}</div>
      {heard && (
        <div className="row spread" style={{ marginTop: 6 }}>
          <span className="small muted">听到：{heard}</span>
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
    <div className="card">
      <div className="row spread">
        <h2>🗣️ 口语 · 影子跟读</h2>
        <span className="badge">🌞 午间 40 分钟 · 重点</span>
      </div>

      <h3>🎯 今日发音重点</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {s.targetSounds.map((t, i) => (
          <li key={i} className="small">{t}</li>
        ))}
      </ul>

      <h3>🔁 影子跟读</h3>
      <p className="small muted">听一句 → 立刻模仿语音语调跟读 → 点 🎤 让系统识别打分。追求节奏和连读，不是逐词念。</p>
      {s.shadowing.map((sh, i) => (
        <ShadowRow key={i} text={sh.text} tip={sh.tip} />
      ))}

      <h3>💬 情景对话（角色扮演）</h3>
      <div className="card" style={{ background: 'var(--card-2)' }}>
        {s.miniDialogue.map((d, i) => (
          <div className="dialogue-line" key={i}>
            <span className="sp">{d.speaker}:</span>
            <span className="grow">{d.line}</span>
            <SpeakButton text={d.line} />
          </div>
        ))}
        <button className="btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => speak(s.miniDialogue.map((d) => d.line).join('. '))}>
          ▶️ 播放整段对话
        </button>
      </div>

      <h3>🎙️ 开口任务</h3>
      <div className="card" style={{ background: '#1e293b', borderColor: 'var(--primary)' }}>
        <p style={{ margin: 0 }}>{s.speakingTask}</p>
        <p className="small muted" style={{ marginTop: 6 }}>录下自己的回答，对比模仿。坚持"每天开口说"是流利的关键。</p>
      </div>

      <BlockFooter done={done} onComplete={onComplete} />
    </div>
  )
}
