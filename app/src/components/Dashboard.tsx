import { useNavigate } from 'react-router-dom'
import { ChevronRight, Flame, ArrowRight, Sparkles, X, Check, Lock, RotateCcw } from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, getDayProgress } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { Button, Card, CardBody, Callout, Tooltip, Progress as Bar } from './ui'
import { BlockIcon } from './blockicons'
import { cn } from '../lib/utils'

const PRINCIPLES = [
  { title: '先听后说', desc: '先盲听 2–3 遍再看原文' },
  { title: '影子跟读', desc: '同步模仿语音语调' },
  { title: '间隔重复', desc: '在遗忘临界点复现词卡' },
  { title: '每天开口', desc: '麦克风跟读打分' },
  { title: '睡前写作', desc: '睡眠帮你巩固记忆' },
  { title: '连续为王', desc: '稳定投入胜过猛学' },
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
    <div className="space-y-7">
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
                <div key={p.title} className="flex items-baseline gap-2 text-[13px]">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-1 rounded-full bg-brand" />
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

      {/* Summary bar — de-carded, hairline-separated columns */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
        <Stat label="总进度" value={`${overall}%`} onClick={() => nav('/progress')} />
        <Stat
          label="连续天数"
          value={<span className="inline-flex items-center gap-1"><Flame size={18} className="text-warning" />{state.streak}</span>}
        />
        <Stat label="已完成天数" value={`${completedDays.length}/${TOTAL_DAYS}`} onClick={() => nav('/progress')} />
        <Stat
          label="待复习"
          value={<span className={due > 0 ? 'text-brand' : ''}>{due}</span>}
          onClick={() => nav('/review')}
        />
      </div>

      {/* Two columns */}
      <div className="grid gap-6 md:grid-cols-12">
        {/* Today plan */}
        <section className="animate-in-up md:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">今日任务 · Day {current}</h2>
            <span className="text-[12px] text-fg-muted">约 {TOTAL_MINUTES} 分钟</span>
          </div>
          <p className="mt-0.5 text-[13px] text-fg-muted">{lesson?.title_zh} · {lesson?.title_en}</p>
          <div className="mt-3 overflow-hidden rounded-[8px] border border-border">
            {BLOCKS.map((b, i) => {
              const done = getDayProgress(state, current).completedBlocks[b.key]
              return (
                <button
                  key={b.key}
                  onClick={() => nav(`/day/${current}#${b.key}`)}
                  className={cn(
                    'group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-200 hover:bg-hover',
                    i > 0 && 'border-t border-border-soft',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-all',
                      done ? 'border-success bg-success text-white' : 'border-border-strong',
                    )}
                  >
                    {done && <Check size={12} strokeWidth={3} />}
                  </span>
                  <BlockIcon k={b.key} size={17} className="shrink-0 text-fg-secondary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[14px] font-medium', done && 'text-fg-muted')}>{b.title_zh}</span>
                      <span className="text-[11px] text-fg-dim">{b.slot.split(' ')[1]}</span>
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
        </section>

        {/* Right column */}
        <div className="space-y-5 md:col-span-5">
          <section className="animate-in-up">
            <h2 className="text-[16px] font-semibold">各阶段完成度</h2>
            <div className="mt-3 space-y-3.5">
              {Object.entries(PHASE_INFO).map(([k, v]) => {
                const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((d) => d.day)
                const doneCount = days.filter((d) => completedDays.includes(d)).length
                const pct = Math.round((doneCount / days.length) * 100)
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
                        <span className="text-fg-secondary">{v.name_zh}</span>
                      </span>
                      <span className="text-fg-muted">{doneCount}/{days.length}</span>
                    </div>
                    <Bar value={pct} color={v.color} className="mt-1.5" />
                  </div>
                )
              })}
            </div>
          </section>

          {due > 0 && (
            <Callout tone="accent" className="animate-in-up items-center" icon={<RotateCcw size={15} className="text-brand" />}>
              <div className="flex w-full items-center justify-between gap-3">
                <span>有 <b className="pulse-once text-brand">{due}</b> 张词卡到期</span>
                <Button size="sm" onClick={() => nav('/review')}>开始复习</Button>
              </div>
            </Callout>
          )}
        </div>
      </div>

      {/* 30-day map */}
      <section className="animate-in-up">
        <h2 className="text-[16px] font-semibold">30 天地图</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(PHASE_INFO).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ background: v.softBg, color: v.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
              {v.name_zh} {v.range}
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
                    isCurrent && 'ring-2 ring-brand ring-offset-1 ring-offset-bg',
                    locked
                      ? 'cursor-not-allowed border-border bg-surface-2'
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
                  <span
                    className={cn('text-[15px] font-semibold', locked && 'text-fg-dim')}
                    style={done ? { color: v.color } : undefined}
                  >
                    {d}
                  </span>
                  {locked ? (
                    <Lock size={9} className="text-fg-dim" />
                  ) : (
                    <span className="text-[9px] text-fg-dim">P{phase}</span>
                  )}
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
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string
  value: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'bg-surface px-4 py-3.5 text-left transition-colors duration-150',
        onClick && 'hover:bg-hover',
      )}
    >
      <div className="text-[24px] font-semibold leading-none tracking-tight">{value}</div>
      <div className="mt-2 text-[12px] font-medium text-fg-muted">{label}</div>
    </button>
  )
}
