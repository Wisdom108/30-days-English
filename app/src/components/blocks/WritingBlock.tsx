import { useState } from 'react'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { SpeakButton } from '../shared'
import BlockFooter from './BlockFooter'

export default function WritingBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const w = lesson.writing
  const { state, storeWriting } = useApp()
  const [text, setText] = useState(state.writings[lesson.day] || '')
  const [showModel, setShowModel] = useState(false)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="card">
      <div className="row spread">
        <h2>✍️ 写作 · 睡前巩固</h2>
        <span className="badge">🌙 睡前 30 分钟</span>
      </div>

      <div className="card" style={{ background: '#1e293b', borderColor: 'var(--primary)' }}>
        <b>题目：</b>{w.prompt}
      </div>

      <h3>🧰 实用表达</h3>
      <div className="row wrap" style={{ gap: 8 }}>
        {w.usefulPhrases.map((p, i) => (
          <span className="pill" key={i}>
            {p} <SpeakButton text={p} />
          </span>
        ))}
      </div>

      <h3>📝 我的写作</h3>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          storeWriting(lesson.day, e.target.value)
        }}
        placeholder="在这里用英文写下你的答案…"
      />
      <div className="small muted">{words} 词 · 自动保存</div>

      <h3>✅ 自查清单</h3>
      <ul className="checklist">
        {w.selfCheck.map((c, i) => (
          <SelfCheckItem key={i} text={c} />
        ))}
      </ul>

      <button className="btn-ghost" onClick={() => setShowModel((s) => !s)}>
        {showModel ? '隐藏范文' : '对照范文'}
      </button>
      {showModel && (
        <div className="card" style={{ background: 'var(--card-2)', marginTop: 12 }}>
          <div className="row spread">
            <b className="small muted">范文</b>
            <SpeakButton text={w.modelAnswer} />
          </div>
          <p style={{ marginBottom: 0 }}>{w.modelAnswer}</p>
        </div>
      )}

      <BlockFooter done={done} onComplete={onComplete} />
    </div>
  )
}

function SelfCheckItem({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <li onClick={() => setC((v) => !v)} style={{ cursor: 'pointer' }}>
      <span>{c ? '☑️' : '⬜'}</span>
      <span className={c ? 'muted' : ''}>{text}</span>
    </li>
  )
}
