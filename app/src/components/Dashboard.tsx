import { useNavigate } from 'react-router-dom'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { ProgressRing } from './shared'

const PRINCIPLES: { icon: string; title: string; desc: string }[] = [
  { icon: '🎧', title: '先听后说', desc: '每天先盲听 2–3 遍再看原文，磨耳朵；听力是口语的地基。' },
  { icon: '🔁', title: '影子跟读', desc: '听一句立刻同步模仿语音语调，追节奏和连读，不逐词念。' },
  { icon: '🃏', title: '间隔重复', desc: '词卡按 SM-2 在遗忘临界点复现（1→3→7→14 天…），每天先清到期卡。' },
  { icon: '🗣️', title: '每天开口', desc: '再害羞也要用麦克风跟读打分、完成开口任务；输出才能内化。' },
  { icon: '✍️', title: '睡前写作', desc: '睡前写几句 + 过一遍新词，睡眠会帮你巩固记忆。' },
  { icon: '🔥', title: '连续为王', desc: '每天完成五模块，保持连胜。稳定的每日投入胜过偶尔猛学。' },
]

function MethodGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="card" style={{ borderColor: 'var(--primary)' }}>
      <div className="row spread">
        <h2>👋 欢迎！30 天怎么练最有效</h2>
        <button className="btn-ghost btn-sm" onClick={onClose}>知道了 ✕</button>
      </div>
      <p className="small muted">
        本计划基于二语习得科学：可理解输入、间隔重复、影子跟读、高频词优先。每天约 2 小时、五个模块按科学时段分布，听说侧重。
      </p>
      <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
        {PRINCIPLES.map((p) => (
          <div className="row" key={p.title} style={{ gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20 }}>{p.icon}</span>
            <div><b>{p.title}</b> <span className="small muted">— {p.desc}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { state, dismissGuide } = useApp()
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
      {!state.guideDismissed && <MethodGuide onClose={dismissGuide} />}
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
