import type { DayLesson } from '../../types'
import { speak } from '../../lib/speech'
import { QAItem, ReadableText } from '../shared'
import BlockFooter from './BlockFooter'

export default function ReadingBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const r = lesson.reading
  return (
    <div className="card">
      <div className="row spread">
        <h2>📖 阅读 · {r.title}</h2>
        <span className="badge">🌆 傍晚 25 分钟</span>
      </div>
      <p className="small muted">先通读理解大意，遇到生词 <b>点一下</b> 即可查释义并听发音（数据来自免费词典 API）。</p>

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className="btn-ghost btn-sm" onClick={() => speak(r.passage, 0.95)}>▶️ 朗读全文</button>
      </div>

      <div className="card" style={{ background: 'var(--card-2)' }}>
        <ReadableText text={r.passage} />
      </div>

      <h3>📌 重点词汇</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {r.glossary.map((g, i) => (
          <div className="row spread small" key={i} style={{ borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
            <b>{g.word}</b>
            <span className="muted">{g.meaning_zh}</span>
          </div>
        ))}
      </div>

      <h3>❓ 阅读理解</h3>
      {r.comprehension.map((qa, i) => (
        <QAItem key={i} q={qa.q} a={qa.a} />
      ))}

      <BlockFooter done={done} onComplete={onComplete} />
    </div>
  )
}
