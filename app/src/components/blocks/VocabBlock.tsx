import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DayLesson } from '../../types'
import { useApp } from '../../state'
import { dueCards } from '../../lib/srs'
import { SpeakButton } from '../shared'
import BlockFooter from './BlockFooter'

export default function VocabBlock({
  lesson,
  done,
  onComplete,
}: {
  lesson: DayLesson
  done: boolean
  onComplete: () => void
}) {
  const { state } = useApp()
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const [flip, setFlip] = useState(false)
  const [mode, setMode] = useState<'browse' | 'quiz'>('browse')

  const words = lesson.vocabulary
  const due = dueCards(state.cards).length

  const card = words[i]

  return (
    <div className="card">
      <div className="row spread">
        <h2>🔤 词汇 · {words.length} 个高频词</h2>
        <span className="badge">☕ 晨间 20 分钟</span>
      </div>

      {due > 0 && (
        <div className="card" style={{ background: '#312e0f22', borderColor: '#f59e0b44' }}>
          <div className="row spread">
            <span className="small">🔁 你有 <b>{due}</b> 张到期词卡（含往日）需要间隔复习</span>
            <button className="btn-sm" onClick={() => nav('/review')}>去复习</button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className={mode === 'browse' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => setMode('browse')}>
          📖 浏览学习
        </button>
        <button className={mode === 'quiz' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => { setMode('quiz'); setI(0); setFlip(false) }}>
          🎴 卡片自测
        </button>
      </div>

      {mode === 'browse' && (
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {words.map((w, idx) => (
            <div className="vocab-card" key={idx}>
              <div className="row spread">
                <span className="vw">{w.word} <span className="pos small">{w.pos}</span></span>
                <SpeakButton text={w.word} />
              </div>
              <span className="vipa">{w.ipa}</span>
              <span>{w.meaning_zh}</span>
              <div className="row spread">
                <span className="vex muted">{w.example_en}</span>
                <SpeakButton text={w.example_en} />
              </div>
              <span className="small muted">{w.example_zh}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'quiz' && card && (
        <>
          <div className="flashcard" style={{ marginTop: 14 }} onClick={() => setFlip((f) => !f)}>
            {!flip ? (
              <>
                <div className="fw">{card.word}</div>
                <div className="fipa">{card.ipa}</div>
                <SpeakButton text={card.word} />
                <div className="small muted">点击卡片翻面看释义</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{card.meaning_zh}</div>
                <div className="small">{card.example_en}</div>
                <div className="small muted">{card.example_zh}</div>
              </>
            )}
          </div>
          <div className="row spread" style={{ marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => { setI((p) => Math.max(0, p - 1)); setFlip(false) }} disabled={i === 0}>← 上一张</button>
            <span className="small muted">{i + 1} / {words.length}</span>
            <button className="btn-ghost" onClick={() => { setI((p) => Math.min(words.length - 1, p + 1)); setFlip(false) }} disabled={i === words.length - 1}>下一张 →</button>
          </div>
        </>
      )}

      <BlockFooter done={done} onComplete={onComplete} />
    </div>
  )
}
