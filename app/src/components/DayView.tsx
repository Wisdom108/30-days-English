import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../state'
import { getLesson } from '../data/curriculum'
import { BLOCKS } from '../blocks'
import type { BlockKey } from '../types'
import { makeCard } from '../lib/srs'
import ListeningBlock from './blocks/ListeningBlock'
import VocabBlock from './blocks/VocabBlock'
import SpeakingBlock from './blocks/SpeakingBlock'
import ReadingBlock from './blocks/ReadingBlock'
import WritingBlock from './blocks/WritingBlock'
import { SpeakButton } from './shared'

export default function DayView() {
  const { day } = useParams()
  const dayNum = Number(day)
  const lesson = getLesson(dayNum)
  const { state, markBlock, addCards } = useApp()
  const nav = useNavigate()

  const hashKey = (window.location.hash.split('#')[2] || '') as BlockKey
  const [active, setActive] = useState<BlockKey>(
    BLOCKS.some((b) => b.key === hashKey) ? hashKey : 'listening',
  )

  // Seed SRS deck with this day's vocabulary the first time the day is opened.
  useEffect(() => {
    if (lesson) addCards(lesson.vocabulary.map((v) => makeCard(v, lesson.day)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  if (!lesson) {
    return (
      <div className="empty">
        <p>找不到 Day {day} 的课程内容。</p>
        <button className="btn-ghost" onClick={() => nav('/')}>返回首页</button>
      </div>
    )
  }

  const prog = state.days[dayNum]?.completedBlocks
  const done = (k: BlockKey) => prog?.[k]
  const complete = (k: BlockKey) => markBlock(dayNum, k)

  return (
    <>
      <div className="card">
        <div className="row spread">
          <button className="btn-ghost btn-sm" onClick={() => nav('/')}>← 首页</button>
          <span className="badge">阶段 {lesson.phase} · Day {lesson.day}/30</span>
        </div>
        <h2 style={{ marginTop: 12 }}>
          {lesson.title_en} <SpeakButton text={lesson.title_en} />
        </h2>
        <p className="muted">{lesson.title_zh} · {lesson.theme}</p>
        <h3>🎯 今日目标</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {lesson.goals.map((g, i) => (
            <li key={i} className="small">{g}</li>
          ))}
        </ul>
        <div className="card" style={{ background: '#312e0f22', borderColor: '#f59e0b44', marginTop: 14, marginBottom: 0 }}>
          <span className="small">🔁 <b>抗遗忘复习：</b>{lesson.reviewFocus}</span>
        </div>
      </div>

      {/* Block switcher */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
        {BLOCKS.map((b) => (
          <button
            key={b.key}
            className={active === b.key ? '' : 'btn-ghost'}
            onClick={() => setActive(b.key)}
            style={{ position: 'relative' }}
          >
            {b.icon} {b.title_zh.split(' ')[0]}
            {done(b.key) && <span style={{ marginLeft: 6, color: '#22c55e' }}>✓</span>}
          </button>
        ))}
      </div>

      {active === 'listening' && (
        <ListeningBlock lesson={lesson} done={!!done('listening')} onComplete={() => complete('listening')} />
      )}
      {active === 'vocab' && (
        <VocabBlock lesson={lesson} done={!!done('vocab')} onComplete={() => complete('vocab')} />
      )}
      {active === 'speaking' && (
        <SpeakingBlock lesson={lesson} done={!!done('speaking')} onComplete={() => complete('speaking')} />
      )}
      {active === 'reading' && (
        <ReadingBlock lesson={lesson} done={!!done('reading')} onComplete={() => complete('reading')} />
      )}
      {active === 'writing' && (
        <WritingBlock lesson={lesson} done={!!done('writing')} onComplete={() => complete('writing')} />
      )}

      <div className="card center">
        <span className="small muted">💡 {lesson.dailyTip_zh}</span>
      </div>
    </>
  )
}
