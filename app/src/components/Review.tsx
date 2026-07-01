import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { dueCards, reviewCard } from '../lib/srs'
import { SpeakButton } from './shared'

const GRADES = [
  { q: 2, label: '重来', hint: '完全忘了', color: '#ef4444' },
  { q: 3, label: '困难', hint: '想了很久', color: '#f59e0b' },
  { q: 4, label: '记得', hint: '有点犹豫', color: '#3b82f6' },
  { q: 5, label: '简单', hint: '脱口而出', color: '#22c55e' },
]

export default function Review() {
  const { state, reviewOne } = useApp()
  const nav = useNavigate()
  const [flip, setFlip] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  // Snapshot the queue once per mount; cards leave as they're graded.
  const queue = useMemo(() => dueCards(state.cards), [])
  const remaining = queue.slice(reviewed)
  const card = remaining[0]

  if (Object.keys(state.cards).length === 0) {
    return (
      <div className="empty">
        <p>还没有词卡。开始学习后，每天的新词会自动加入复习队列。</p>
        <button onClick={() => nav('/')}>去学习</button>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="card center">
        <div style={{ fontSize: 44 }}>🎉</div>
        <h2>今日复习完成！</h2>
        <p className="muted">
          {reviewed > 0 ? `你复习了 ${reviewed} 张词卡。` : '现在没有到期的词卡。'}间隔重复会在最佳时机把它们再送回来。
        </p>
        <button onClick={() => nav('/')}>返回首页</button>
      </div>
    )
  }

  const grade = (q: number) => {
    reviewOne(reviewCard(card, q))
    setReviewed((n) => n + 1)
    setFlip(false)
  }

  return (
    <>
      <div className="row spread" style={{ marginBottom: 12 }}>
        <button className="btn-ghost btn-sm" onClick={() => nav('/')}>← 首页</button>
        <span className="pill">剩余 {remaining.length} 张</span>
      </div>

      <div className="flashcard" onClick={() => setFlip((f) => !f)}>
        {!flip ? (
          <>
            <div className="fw">{card.word}</div>
            <div className="fipa">{card.ipa}</div>
            <SpeakButton text={card.word} />
            <div className="small muted">点击回忆释义，再翻面</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{card.meaning_zh}</div>
            <div className="small" style={{ marginTop: 6 }}>{card.example_en}</div>
            <SpeakButton text={card.example_en} />
          </>
        )}
      </div>

      {flip ? (
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          {GRADES.map((g) => (
            <button
              key={g.q}
              className="grow"
              style={{ background: g.color, flexDirection: 'column', display: 'flex', alignItems: 'center' }}
              onClick={() => grade(g.q)}
            >
              <span>{g.label}</span>
              <span className="small" style={{ opacity: 0.85 }}>{g.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <button style={{ width: '100%', marginTop: 16 }} onClick={() => setFlip(true)}>
          显示答案
        </button>
      )}
      <p className="small muted center" style={{ marginTop: 12 }}>
        依据 SM-2 算法：越熟的词，下次出现间隔越长（1天→3天→1周→2周→1月…）
      </p>
    </>
  )
}
