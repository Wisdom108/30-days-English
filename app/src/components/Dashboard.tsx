import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { ProgressRing } from './shared'

export default function Dashboard() {
  const { state } = useApp()
  const nav = useNavigate()

  if (CURRICULUM.length === 0) {
    return (
      <div className="empty">
        <p>课程内容正在生成中…（lessons.json 为空）</p>
      </div>
    )
  }

  const completedDays = Object.keys(state.days).filter((d) => isDayComplete(state, Number(d))).length
  const overall = Math.round((completedDays / TOTAL_DAYS) * 100)
  const due = dueCards(state.cards).length
  const current = Math.min(state.currentDay, TOTAL_DAYS)

  return (
    <>
      <div className="card">
        <div className="progress-ring-wrap">
          <div style={{ position: 'relative' }}>
            <ProgressRing value={overall} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800 }}>{overall}%</div>
              <div className="small muted">完成</div>
            </div>
          </div>
          <div className="grow row spread" style={{ gap: 8 }}>
            <div className="stat">
              <div className="v">🔥 {state.streak}</div>
              <div className="k">连续天数</div>
            </div>
            <div className="stat">
              <div className="v">{completedDays}/{TOTAL_DAYS}</div>
              <div className="k">已完成日</div>
            </div>
            <div className="stat">
              <div className="v">{Object.keys(state.cards).length}</div>
              <div className="k">词卡总数</div>
            </div>
          </div>
        </div>
        {due > 0 && (
          <button style={{ width: '100%', marginTop: 16 }} onClick={() => nav('/review')}>
            🔁 有 {due} 张词卡待复习 — 立即巩固
          </button>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <h2>📌 今日任务 · Day {current}</h2>
          <span className="small muted">约 {TOTAL_MINUTES} 分钟 · 听说侧重</span>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          {getLessonTitle(current)}
        </p>
        <div className="block-list" style={{ marginTop: 12 }}>
          {BLOCKS.map((b) => {
            const done = state.days[current]?.completedBlocks[b.key]
            return (
              <div
                key={b.key}
                className={`block-item ${done ? 'done' : ''}`}
                onClick={() => nav(`/day/${current}#${b.key}`)}
              >
                <span className="b-icon">{b.icon}</span>
                <div className="grow">
                  <div className="b-slot">{b.slot}</div>
                  <div className="b-title">{b.title_zh}</div>
                  <div className="b-sub">{b.subtitle_zh}</div>
                </div>
                <div className="center">
                  <div className="b-min">{b.minutes} 分钟</div>
                  {done && <div style={{ color: '#22c55e', fontSize: 18 }}>✓</div>}
                </div>
              </div>
            )
          })}
        </div>
        <button style={{ width: '100%', marginTop: 14 }} onClick={() => nav(`/day/${current}`)}>
          进入 Day {current} 学习 →
        </button>
      </div>

      <div className="card">
        <h2>🗓️ 30 天地图</h2>
        <div className="row wrap" style={{ gap: 8, margin: '8px 0 14px' }}>
          {Object.entries(PHASE_INFO).map(([k, v]) => (
            <span key={k} className="badge tag-phase" style={{ background: v.color }}>
              阶段{k} {v.name_zh} · {v.range}
            </span>
          ))}
        </div>
        <div className="grid-days">
          {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
            const done = isDayComplete(state, d)
            const locked = d > state.currentDay
            const isCurrent = d === current
            const phase = CURRICULUM.find((l) => l.day === d)?.phase ?? 1
            return (
              <div
                key={d}
                className={`day-cell ${done ? 'done' : ''} ${isCurrent ? 'current' : ''} ${
                  locked ? 'locked' : ''
                }`}
                onClick={() => !locked && nav(`/day/${d}`)}
                style={
                  !done && !locked
                    ? { borderColor: (PHASE_INFO[phase]?.color || '#334155') + '77' }
                    : undefined
                }
              >
                {done && <span className="check">✓</span>}
                <span className="n">{d}</span>
                <span className="lbl">{locked ? '🔒' : `P${phase}`}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function getLessonTitle(day: number): string {
  const l = CURRICULUM.find((x) => x.day === day)
  return l ? `${l.title_zh} · ${l.title_en}` : ''
}
