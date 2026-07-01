import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame, X, ArrowRight, Sparkles } from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { Button, Card, CardBody } from './ui'
import { ProgressRing } from './shared'
import { cn } from '../lib/utils'

const PRINCIPLES = [
  { icon: '🎧', title: '先听后说', desc: '每天先盲听 2–3 遍再看原文，磨耳朵；听力是口语的地基。' },
  { icon: '🔁', title: '影子跟读', desc: '听一句立刻同步模仿语音语调，追节奏和连读，不逐词念。' },
  { icon: '🃏', title: '间隔重复', desc: '词卡按 SM-2 在遗忘临界点复现（1→3→7→14 天…），先清到期卡。' },
  { icon: '🗣️', title: '每天开口', desc: '用麦克风跟读打分、完成开口任务；输出才能内化。' },
  { icon: '✍️', title: '睡前写作', desc: '睡前写几句 + 过一遍新词，睡眠会帮你巩固记忆。' },
  { icon: '🔥', title: '连续为王', desc: '每天完成五模块保持连胜；稳定投入胜过偶尔猛学。' },
]

function MethodGuide({ onClose }: { onClose: () => void }) {
  return (
    <Card className="mb-4 animate-in-up glow-brand">
      <CardBody>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand" />
            <h2 className="text-[17px]">欢迎！30 天怎么练最有效</h2>
          </div>
          <button
            className="grid h-7 w-7 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          本计划基于二语习得科学：可理解输入、间隔重复、影子跟读、高频词优先。每天约 2 小时、五个模块按科学时段分布，听说侧重。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="flex items-start gap-3">
              <span className="text-[18px] leading-none">{p.icon}</span>
              <div className="text-[13px] leading-snug">
                <span className="font-medium text-fg">{p.title}</span>
                <span className="text-fg-muted"> — {p.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

export default function Dashboard() {
  const { state, dismissGuide } = useApp()
  const nav = useNavigate()

  if (CURRICULUM.length === 0) {
    return <div className="py-16 text-center text-fg-muted">课程内容正在生成中…</div>
  }

  const completedDays = Object.keys(state.days).filter((d) => isDayComplete(state, Number(d))).length
  const overall = Math.round((completedDays / TOTAL_DAYS) * 100)
  const due = dueCards(state.cards).length
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const lesson = CURRICULUM.find((l) => l.day === current)

  return (
    <div className="space-y-4">
      {!state.guideDismissed && <MethodGuide onClose={dismissGuide} />}

      {/* Hero */}
      <Card className="animate-in-up">
        <CardBody className="flex items-center gap-5">
          <ProgressRing value={overall}>
            <div className="text-center">
              <div className="text-[20px] font-semibold leading-none">{overall}%</div>
              <div className="mt-0.5 text-[10px] text-fg-dim">完成</div>
            </div>
          </ProgressRing>
          <div className="grid flex-1 grid-cols-3 gap-2">
            <Stat value={<span className="inline-flex items-center gap-1"><Flame size={16} className="text-warning" />{state.streak}</span>} label="连续天数" />
            <Stat value={`${completedDays}/${TOTAL_DAYS}`} label="已完成日" />
            <Stat value={Object.keys(state.cards).length} label="词卡总数" />
          </div>
        </CardBody>
        {due > 0 && (
          <div className="border-t border-border px-5 py-3">
            <Button variant="secondary" className="w-full" onClick={() => nav('/review')}>
              🔁 有 {due} 张词卡待复习 — 立即巩固
            </Button>
          </div>
        )}
      </Card>

      {/* Today */}
      <Card className="animate-in-up">
        <CardBody>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px]">📌 今日任务 · Day {current}</h2>
            <span className="text-[12px] text-fg-dim">约 {TOTAL_MINUTES} 分钟 · 听说侧重</span>
          </div>
          {lesson && (
            <p className="mt-1 text-[13px] text-fg-muted">
              {lesson.title_zh} · {lesson.title_en}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {BLOCKS.map((b) => {
              const done = state.days[current]?.completedBlocks[b.key]
              return (
                <button
                  key={b.key}
                  onClick={() => nav(`/day/${current}#${b.key}`)}
                  className={cn(
                    'group flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all',
                    done
                      ? 'border-success/25 bg-success/[0.06]'
                      : 'border-border bg-surface-2 hover:border-[#2c2e33] hover:bg-elevated',
                  )}
                >
                  <span className="text-[22px] leading-none">{b.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-warning/90">{b.slot}</div>
                    <div className="text-[14px] font-medium">{b.title_zh}</div>
                    <div className="truncate text-[12px] text-fg-muted">{b.subtitle_zh}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[12px] text-fg-dim">{b.minutes}′</span>
                    {done ? (
                      <span className="text-[13px] text-success">✓</span>
                    ) : (
                      <ChevronRight size={16} className="text-fg-dim transition-transform group-hover:translate-x-0.5" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <Button className="mt-4 w-full" onClick={() => nav(`/day/${current}`)}>
            进入 Day {current} 学习 <ArrowRight size={16} />
          </Button>
        </CardBody>
      </Card>

      {/* 30-day map */}
      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px]">🗓️ 30 天地图</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(PHASE_INFO).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                style={{ borderColor: v.color + '55', background: v.color + '18', color: v.color }}
              >
                阶段{k} {v.name_zh} · {v.range}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
              const done = isDayComplete(state, d)
              const locked = d > state.currentDay
              const isCurrent = d === current
              const phase = CURRICULUM.find((l) => l.day === d)?.phase ?? 1
              const color = PHASE_INFO[phase]?.color || '#5e6ad2'
              return (
                <button
                  key={d}
                  disabled={locked}
                  onClick={() => !locked && nav(`/day/${d}`)}
                  className={cn(
                    'relative grid aspect-square place-items-center rounded-xl border text-center transition-all',
                    done && 'border-success/40 bg-success/10',
                    isCurrent && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
                    locked ? 'cursor-not-allowed border-border bg-surface-2/50 opacity-40' : 'hover:-translate-y-0.5',
                    !done && !locked && 'bg-surface-2',
                  )}
                  style={!done && !locked ? { borderColor: color + '44' } : undefined}
                >
                  {done && <span className="absolute right-1.5 top-1.5 text-[10px] text-success">✓</span>}
                  <span className="text-[17px] font-semibold">{d}</span>
                  <span className="text-[9px] text-fg-dim">{locked ? '🔒' : `P${phase}`}</span>
                </button>
              )
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5 text-center">
      <div className="text-[19px] font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-fg-dim">{label}</div>
    </div>
  )
}
