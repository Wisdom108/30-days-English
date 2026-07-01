import { useState } from 'react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete } from '../lib/storage'
import { BLOCKS, PHASE_INFO } from '../blocks'
import { todayISO } from '../lib/srs'
import { buildIcs, downloadIcs } from '../lib/calendar'

export default function Progress() {
  const { state, reset } = useApp()
  const [hour, setHour] = useState(7)

  const completedDays = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).filter((d) =>
    isDayComplete(state, d),
  )
  const today = todayISO()
  const matured = Object.values(state.cards).filter((c) => c.repetitions >= 2).length
  const dueToday = Object.values(state.cards).filter((c) => c.dueDate <= today).length

  const blockCounts = BLOCKS.map((b) => ({
    ...b,
    count: Object.values(state.days).filter((d) => d.completedBlocks[b.key]).length,
  }))

  return (
    <>
      <div className="card">
        <h2>📈 学习进度</h2>
        <div className="row spread wrap" style={{ gap: 12, marginTop: 12 }}>
          <div className="stat"><div className="v">🔥 {state.streak}</div><div className="k">连续天数</div></div>
          <div className="stat"><div className="v">{completedDays.length}</div><div className="k">完成天数</div></div>
          <div className="stat"><div className="v">{Object.keys(state.cards).length}</div><div className="k">词卡总数</div></div>
          <div className="stat"><div className="v">{matured}</div><div className="k">已掌握词</div></div>
          <div className="stat"><div className="v">{dueToday}</div><div className="k">今日待复习</div></div>
        </div>
        {state.startDate && <p className="small muted" style={{ marginTop: 10 }}>开始日期：{state.startDate}</p>}
      </div>

      <div className="card">
        <h2>🧭 各阶段完成度</h2>
        {Object.entries(PHASE_INFO).map(([k, v]) => {
          const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((l) => l.day)
          const doneCount = days.filter((d) => completedDays.includes(d)).length
          const pct = days.length ? Math.round((doneCount / days.length) * 100) : 0
          return (
            <div key={k} style={{ margin: '12px 0' }}>
              <div className="row spread small">
                <span><b style={{ color: v.color }}>阶段 {k}</b> {v.name_zh} · {v.range}</span>
                <span className="muted">{doneCount}/{days.length}</span>
              </div>
              <div className="bar" style={{ marginTop: 6 }}><span style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <h2>🎯 四项技能打卡次数</h2>
        {blockCounts.map((b) => (
          <div key={b.key} style={{ margin: '10px 0' }}>
            <div className="row spread small">
              <span>{b.icon} {b.title_zh}</span>
              <span className="muted">{b.count}/{TOTAL_DAYS}</span>
            </div>
            <div className="bar" style={{ marginTop: 6 }}>
              <span style={{ width: `${Math.round((b.count / TOTAL_DAYS) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>📅 每日定时陪跑 · 日历提醒</h2>
        <p className="small muted">
          导出 30 天每日学习提醒，导入 Google / Apple / Outlook 日历即可每天定时提醒（从你的开始日期
          {state.startDate ? ` ${state.startDate}` : '（今天）'}起算，共 30 天）。
        </p>
        <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
          <label className="small muted">提醒时间：</label>
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            style={{ background: 'var(--card-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}
          >
            {[6, 7, 8, 9, 12, 18, 20, 21].map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <button
            onClick={() =>
              downloadIcs(buildIcs(CURRICULUM, state.startDate || todayISO(), hour))
            }
          >
            ⬇️ 导出日历提醒 (.ics)
          </button>
        </div>
      </div>

      <div className="card center">
        <button className="btn-ghost btn-sm" onClick={reset} style={{ color: '#fca5a5' }}>
          ⚠️ 清空全部进度
        </button>
      </div>
    </>
  )
}
