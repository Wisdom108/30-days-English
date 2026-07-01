import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame, ArrowRight, Sparkles, X, Check } from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, getDayProgress } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { Button, Card, CardBody, Callout, Tooltip } from './ui'
import { ProgressRing } from './shared'
import { cn } from '../lib/utils'

const PRINCIPLES = [
  { icon: '🎧', title: '先听后说', desc: '先盲听 2–3 遍再看原文' },
  { icon: '🔁', title: '影子跟读', desc: '同步模仿语音语调' },
  { icon: '🃏', title: '间隔重复', desc: '在遗忘临界点复现词卡' },
  { icon: '🗣️', title: '每天开口', desc: '麦克风跟读打分' },
  { icon: '✍️', title: '睡前写作', desc: '睡眠帮你巩固记忆' },
  { icon: '🔥', title: '连续为王', desc: '稳定投入胜过猛学' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
}

export default function Dashboard() {
  const { state, dismissGuide } = useApp()
  const nav = useNavigate()

  if (CURRICULUM.length === 0) {
    return <div className="py-16 text-center text-fg-muted">课程内容正在生成中…</div>
  }

  const completedDays = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).filter((d) =>
    isDayComplete(state, d),
  )
  const overall = Math.round((completedDays.length / TOTAL_DAYS) * 100)
  const due = dueCards(state.cards).length
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const lesson = CURRICULUM.find((l) => l.day === current)
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })

  return (
    <div className="space-y-6">
      {!state.guideDismissed && (
        <Card className="animate-in-up">
          <CardBody>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-brand" />
                <h2 className="text-[15px] font-semibold">欢迎！30 天怎么练最有效</h2>
              </div>
              <button
                className="grid h-7 w-7 place-items-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                onClick={dismissGuide}
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="flex items-start gap-2 text-[13px]">
                  <span className="leading-none">{p.icon}</span>
                  <span>
                    <b className="font-medium text-fg">{p.title}</b>
                    <span className="text-fg-muted"> · {p.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Page header */}
      <div className="animate-in-up">
        <h1 className="text-[26px] font-semibold tracking-tight md:text-[28px]">
          {greeting()} · 今天是 Day {current}
        </h1>
        <p className="mt-1 text-[15px] text-fg-muted">
          还剩 {TOTAL_DAYS - completedDays.length} 天 · {lesson?.title_zh} · {today}
        </p>
        <div className="mt-4 border-t border-border" />
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="总进度" value={`${overall}%`} onClick={() => nav('/progress')} />
        <StatCard
          label="连续天数"
          value={<span className="inline-flex items-center gap-1"><Flame size={17} className="text-warning" />{state.streak}</span>}
        />
        <StatCard label="已完成天数" value={`${completedDays.length}/${TOTAL_DAYS}`} onClick={() => nav('/progress')} />
        <StatCard
          label="待复习"
          value={<span className={due > 0 ? 'text-brand' : 'text-fg'}>{due}</span>}
          pulse={due > 0}
          onClick={() => nav('/review')}
        />
      </div>

      {/* Two columns */}
      <div className="grid gap-4 md:grid-cols-12">
        {/* Today plan */}
        <Card className="animate-in-up md:col-span-7">
          <CardBody>
            <h2 className="text-[16px] font-semibold">📅 今日任务 · Day {current}</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              约 {TOTAL_MINUTES} 分钟 · {lesson?.title_zh} · {lesson?.title_en}
            </p>
            <div className="mt-3">
              {BLOCKS.map((b) => {
                const done = getDayProgress(state, current).completedBlocks[b.key]
                return (
                  <button
                    key={b.key}
                    onClick={() => nav(`/day/${current}#${b.key}`)}
                    className="group flex w-full items-center gap-3 rounded-[6px] border-b border-border-soft px-2 py-2.5 text-left transition-colors duration-200 last:border-0 hover:bg-hover"
                  >
                    <span
                      className={cn(
                        'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-all',
                        done ? 'border-success bg-success text-white' : 'border-border-strong',
                      )}
                    >
                      {done && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-[18px] leading-none">{b.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[14px] font-medium', done && 'text-fg-muted')}>{b.title_zh}</span>
                        <span className="text-[11px] text-warning/90">{b.slot.split(' ')[0]}</span>
                      </div>
                      <div className="truncate text-[12px] text-fg-muted">{b.subtitle_zh}</div>
                    </div>
                    <span className="text-[11px] text-fg-muted">{b.minutes}′</span>
                    <ChevronRight size={15} className="text-fg-dim opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                )
              })}
            </div>
            <Button className="mt-4 w-full" onClick={() => nav(`/day/${current}`)}>
              进入 Day {current} 学习 <ArrowRight size={15} />
            </Button>
          </CardBody>
        </Card>

        {/* Right column */}
        <div className="space-y-4 md:col-span-5">
          <Card className="animate-in-up">
            <CardBody>
              <h2 className="text-[15px] font-semibold">🧭 各阶段完成度</h2>
              <div className="mt-3 flex justify-around">
                {Object.entries(PHASE_INFO).map(([k, v]) => {
                  const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((d) => d.day)
                  const doneCount = days.filter((d) => completedDays.includes(d)).length
                  const pct = Math.round((doneCount / days.length) * 100)
                  return (
                    <div key={k} className="flex flex-col items-center gap-1.5">
                      <ProgressRing value={pct} size={64} stroke={6} color={v.color}>
                        <span className="text-[13px] font-semibold">{pct}%</span>
                      </ProgressRing>
                      <span className="text-[11px] text-fg-muted">{v.name_zh}</span>
                      <span className="text-[11px] text-fg-dim">{doneCount}/{days.length}</span>
                    </div>
                  )
                })}
              </div>
            </CardBody>
          </Card>

          {due > 0 && (
            <Callout tone="accent" className="animate-in-up items-center">
              <div className="flex w-full items-center justify-between gap-3">
                <span>🔁 有 <b className={due > 0 ? 'pulse-once text-brand' : ''}>{due}</b> 张词卡到期</span>
                <Button size="sm" onClick={() => nav('/review')}>开始复习</Button>
              </div>
            </Callout>
          )}
        </div>
      </div>

      {/* 30-day map */}
      <Card className="animate-in-up">
        <CardBody>
          <h2 className="text-[16px] font-semibold">🗓 30 天地图</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(PHASE_INFO).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{ background: v.softBg, color: v.color }}
              >
                {v.dot} {v.name_zh} {v.range}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2 md:grid-cols-10">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
              const done = isDayComplete(state, d)
              const locked = d > state.currentDay
              const isCurrent = d === current
              const phase = CURRICULUM.find((l) => l.day === d)?.phase ?? 1
              const v = PHASE_INFO[phase]
              const lz = CURRICULUM.find((l) => l.day === d)?.title_zh ?? ''
              return (
                <Tooltip key={d} label={`Day ${d} · ${lz}`}>
                  <button
                    disabled={locked}
                    onClick={() => !locked && nav(`/day/${d}`)}
                    className={cn(
                      'relative grid aspect-square place-items-center rounded-[6px] border text-center transition-all',
                      isCurrent && 'ring-2 ring-brand ring-offset-1 ring-offset-surface',
                      locked
                        ? 'cursor-not-allowed border-border bg-surface-2 text-fg-dim'
                        : 'hover:-translate-y-px active:scale-[0.98]',
                    )}
                    style={
                      done
                        ? { background: v.softBg, borderColor: v.color + '55' }
                        : !locked
                        ? { borderColor: v.color + '40' }
                        : undefined
                    }
                  >
                    {done && (
                      <span className="absolute right-1 top-1" style={{ color: v.color }}>
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <span className="text-[15px] font-semibold" style={done ? { color: v.color } : undefined}>
                      {d}
                    </span>
                    <span className="text-[9px] text-fg-dim">{locked ? '🔒' : `P${phase}`}</span>
                  </button>
                </Tooltip>
              )
            })}
          </div>

          {/* Rhythm strip */}
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-fg-secondary">本月节奏</span>
              <span className="text-[11px] text-fg-muted">已完成 {completedDays.length}/30 天</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
                const done = getDayProgress(state, d).completedAt
                return (
                  <span
                    key={d}
                    className="h-2.5 w-2.5 rounded-full"
                    style={done ? { background: 'var(--color-success)' } : { border: '1px solid var(--color-border-strong)' }}
                  />
                )
              })}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  onClick,
  pulse,
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
  pulse?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-[8px] border border-border bg-surface p-4 text-left shadow-rest transition-all duration-150',
        onClick && 'hover:border-border-strong hover:shadow-raised',
        pulse && 'pulse-once bg-accent-soft/40',
      )}
    >
      <div className="text-[20px] font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-[11px] text-fg-muted">{label}</div>
    </button>
  )
}
