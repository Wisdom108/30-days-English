import { useState } from 'react'
import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, SpeakButton } from '../shared'
import BlockFooter from './BlockFooter'

export default function ListeningBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const l = lesson.listening
  const [showScript, setShowScript] = useState(false)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)

  const sentences = l.script.split(/(?<=[.!?])\s+/).filter(Boolean)

  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9']/g, '')

  return (
    <div className="card">
      <div className="row spread">
        <h2>🎧 精听 · {l.title}</h2>
        <span className="badge">🌅 晨起 30 分钟</span>
      </div>
      <p className="small muted">先盲听整段 2–3 遍，再逐句跟读，最后做听写。别急着看原文！</p>

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <button onClick={() => speak(l.script, 0.95)}>▶️ 播放全文</button>
        <button className="btn-ghost" onClick={() => speak(l.script, 0.7)}>🐢 慢速播放</button>
        <button className="btn-ghost" onClick={() => setShowScript((s) => !s)}>
          {showScript ? '隐藏原文' : '显示原文'}
        </button>
      </div>

      {showScript && (
        <div className="card" style={{ background: 'var(--card-2)', marginTop: 12 }}>
          {sentences.map((s, i) => (
            <div className="row spread" key={i} style={{ padding: '4px 0' }}>
              <span className="small">{s}</span>
              <SpeakButton text={s} />
            </div>
          ))}
        </div>
      )}

      <h3>✍️ 听写填空</h3>
      <p className="small muted">播放对应句子，把听到的词填进空格。</p>
      {l.dictation.map((d, i) => {
        const ok = checked && norm(answers[i] || '') === norm(d.answer)
        const bad = checked && !ok
        const parts = d.sentence.split('____')
        return (
          <div className="shadow-item" key={i}>
            <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
              <SpeakButton text={d.sentence.replace('____', d.answer)} />
              <span className="small">{parts[0]}</span>
              <input
                type="text"
                className={ok ? 'correct' : bad ? 'wrong' : ''}
                style={{ width: 120 }}
                value={answers[i] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                placeholder="?"
              />
              <span className="small">{parts[1]}</span>
            </div>
            {bad && <div className="small" style={{ color: '#86efac', marginTop: 4 }}>答案：{d.answer}</div>}
          </div>
        )
      })}
      <button className="btn-ghost btn-sm" onClick={() => setChecked(true)} style={{ marginTop: 4 }}>
        检查听写
      </button>

      <h3>❓ 听力理解</h3>
      {l.comprehension.map((qa, i) => (
        <QAItem key={i} q={qa.q} a={qa.a} />
      ))}

      <BlockFooter done={done} onComplete={onComplete} />
    </div>
  )
}
