import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, ArrowRight, X, Check, Lock, RotateCcw,
  Sunrise, Coffee, Sun, Sunset, Moon, type LucideIcon,
} from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, getDayProgress, displayStreak, isDayUnlocked } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { Card, CardHead, Segment, Button, IconButton, Callout, Tooltip, Progress as Bar, Metric } from './ui'
import { BlockIcon } from './blockicons'
import { cn } from '../lib/utils'

const MOD: Record<string, { en: string; Slot: LucideIcon; slot: string }> = {
  listening: { en: 'Listening', Slot: Sunrise, slot: 'DAWN' },
  vocab: { en: 'Vocab SRS', Slot: Coffee, slot: 'AM' },
  speaking: { en: 'Speaking', Slot: Sun, slot: 'NOON' },
  reading: { en: 'Reading', Slot: Sunset, slot: 'DUSK' },
  writing: { en: 'Writing', Slot: Moon, slot: 'NIGHT' },
}
const PHASE_EN: Record<number, string> = { 1: 'Survival', 2: 'Daily Life', 3: 'Fluency' }

const PRINCIPLES = [
  ['先听后说', '先盲听 2–3 遍再看原文'],
  ['影子跟读', '同步模仿语音语调'],
  ['间隔重复', '在遗忘临界点复现词卡'],
  ['每天开口', '麦克风跟读打分'],
  ['睡前写作', '睡眠帮你巩固记忆'],
  ['连续为王', '稳定投入胜过猛学'],
]

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'Good morning' : h < 14 ? 'Good afternoon' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { state, dismissGuide, unlockAllDays } = useApp()
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
  const streak = displayStreak(state)
  const lesson = CURRICULUM.find((l) => l.day === current)
  const dd = String(current).padStart(2, '0')
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()

  return (
    <div className="space-y-4">
      {!state.guideDismissed && (
        <Card className="animate-in-up">
          <div className="flex items-start justify-between p-5 pb-3">
            <div>
              <div className="label-nd">Getting started</div>
              <h2 className="mt-1.5 text-h2 font-semibold">30 天怎么练最有效</h2>
            </div>
            <IconButton label="关闭引导" size="sm" onClick={dismissGuide}><X size={15} /></IconButton>
          </div>
          <div className="grid gap-x-6 gap-y-2 px-5 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map(([t, d]) => (
              <div key={t} className="flex items-baseline gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[1px] bg-red" />
                <span><b className="font-medium text-fg">{t}</b><span className="text-fg-muted"> · {d}</span></span>
              </div>
            ))}
          </div>
          {!state.unlockAll && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-5 py-3 text-sm">
              <span className="text-fg-muted">已有基础，想自由跳学？</span>
              <button onClick={unlockAllDays} className="font-medium text-fg underline decoration-dotted underline-offset-4 hover:text-fg-secondary">
                解锁全部 30 天 →
              </button>
            </div>
          )}
        </Card>
      )}

      {/* hero */}
      <section className="flex items-end justify-between gap-6 py-2 animate-in-up">
        <div>
          <div className="label-nd">{greeting()}</div>
          <h1 className="mt-2 text-title font-semibold">
            Day {current} <span className="text-fg-secondary">/ {lesson?.title_en ?? lesson?.title_zh}</span>
          </h1>
          <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-muted">
            {TOTAL_DAYS - completedDays.length} days left · A2 → B1 · {today}
          </div>
        </div>
        <div className="text-right leading-[0.82]">
          <div className="font-mono text-[11px] tracking-[0.24em] text-fg-dim">DAY</div>
          <div className="t-num text-[76px] font-semibold text-fg sm:text-[88px]">{dd}</div>
        </div>
      </section>

      {/* metric readout */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-4 animate-in-up">
        <div className="border-b border-border sm:border-b-0">
          <Metric label="Progress" value={overall} unit="%" onClick={() => nav('/progress')} icon={<ArrowRight size={13} />}>
            <Bar value={overall} />
          </Metric>
        </div>
        <div className="border-b border-l border-border sm:border-b-0">
          <Metric label="Streak" value={streak} unit="d" icon={<span className="text-[13px]">{streak > 0 ? '🔥' : ''}</span>}>
            <MiniCells n={7} on={Math.min(streak, 7)} />
          </Metric>
        </div>
        <div className="border-l border-border sm:border-l-0">
          <Metric label="Complete" value={completedDays.length} unit={`/${TOTAL_DAYS}`} onClick={() => nav('/progress')} icon={<Check size={13} />}>
            <MiniCells n={10} on={Math.round((completedDays.length / TOTAL_DAYS) * 10)} />
          </Metric>
        </div>
        <div className="border-l border-border">
          <Metric label="Due" value={due} red={due > 0} onClick={() => nav('/review')} icon={due > 0 ? <span className="pulse-red inline-block h-2 w-2 rounded-full bg-red" /> : undefined}>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">{due > 0 ? 'cards to review' : 'all caught up'}</span>
          </Metric>
        </div>
      </div>

      {/* two columns */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* TODAY */}
        <Card className="animate-in-up">
          <CardHead
            title={`Today · Day ${current}`}
            right={<span className="label-nd">~{TOTAL_MINUTES} min</span>}
          />
          <div className="p-3">
            <Segment>
              {BLOCKS.map((b, i) => {
                const m = MOD[b.key]
                const done = getDayProgress(state, current).completedBlocks[b.key]
                const Slot = m?.Slot ?? Sun
                return (
                  <button
                    key={b.key}
                    onClick={() => nav(`/day/${current}?b=${b.key}`)}
                    className={cn(
                      'group grid w-full grid-cols-[24px_24px_1fr_auto_44px_16px] items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-hover sm:gap-3',
                      i > 0 && 'border-t border-border',
                      done && 'opacity-70',
                    )}
                  >
                    <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-sm border', done ? 'border-fg bg-fg text-black' : 'border-border-strong')}>
                      {done && <Check size={13} strokeWidth={3} />}
                    </span>
                    <BlockIcon k={b.key} size={18} className="text-fg-secondary" />
                    <span className={cn('min-w-0 truncate text-body font-medium', done ? 'text-fg-muted' : 'text-fg')}>{m?.en ?? b.title_zh}</span>
                    <span className="hidden items-center gap-1.5 sm:flex">
                      <Slot size={14} className="text-fg-dim" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-dim">{m?.slot}</span>
                    </span>
                    <span className="t-num text-right text-body font-medium text-fg-secondary">{b.minutes}′</span>
                    <ChevronRight size={15} className="text-fg-dim opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                )
              })}
            </Segment>
          </div>
          <div className="px-3 pb-4">
            <Button className="w-full" size="lg" onClick={() => nav(`/day/${current}`)}>
              START DAY {current} <ArrowRight size={16} />
            </Button>
          </div>
        </Card>

        {/* right */}
        <div className="space-y-4">
          <Card className="animate-in-up">
            <CardHead title="Phases" />
            <div>
              {Object.entries(PHASE_INFO).map(([k, v], i) => {
                const days = CURRICULUM.filter((l) => l.phase === Number(k)).map((d) => d.day)
                const doneCount = days.filter((d) => completedDays.includes(d)).length
                const pct = Math.round((doneCount / days.length) * 100)
                return (
                  <div key={k} className={cn('grid grid-cols-[10px_1fr_auto] items-center gap-3 px-[18px] py-3.5', i > 0 && 'border-t border-border')}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-fg">{PHASE_EN[Number(k)]}</span>
                        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-dim">{v.range}</span>
                      </div>
                      <Bar value={pct} color={v.color} className="mt-1.5" />
                    </div>
                    <span className="t-num text-sm text-fg-secondary">{doneCount}/{days.length}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {due > 0 && (
            <Callout tone="red" className="animate-in-up items-center" icon={<RotateCcw size={15} className="text-red" />}>
              <div className="flex w-full items-center justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em]"><b className="t-num text-red">{due}</b> cards due</span>
                <Button size="sm" onClick={() => nav('/review')}>REVIEW</Button>
              </div>
            </Callout>
          )}
        </div>
      </div>

      {/* curriculum */}
      <Card className="animate-in-up">
        <CardHead
          title="Curriculum · 30D"
          right={
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PHASE_INFO).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ background: v.softBg, color: v.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />{PHASE_EN[Number(k)]}
                </span>
              ))}
            </div>
          }
        />
        <div className="p-[18px]">
          <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
              const done = isDayComplete(state, d)
              const locked = !isDayUnlocked(state, d)
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
                      'relative grid aspect-square place-items-center rounded-sm border text-center transition-transform duration-200 animate-slam',
                      isCurrent && 'border-fg shadow-[0_0_0_1px_var(--color-fg)]',
                      locked ? 'cursor-not-allowed border-border bg-surface-2 opacity-45' : 'hover:-translate-y-0.5 hover:scale-[1.05]',
                    )}
                    style={{ animationDelay: `${d * 12}ms`, ...(done ? { background: v.softBg, borderColor: v.color + '66' } : !locked ? { borderColor: v.color + '40' } : {}) }}
                  >
                    {done && <span className="absolute right-1 top-1" style={{ color: v.color }}><Check size={11} strokeWidth={3} /></span>}
                    {isCurrent && <span className="pulse-red absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-red" />}
                    <span className={cn('t-num text-h2 font-medium', locked && 'text-fg-dim')} style={done ? { color: v.color } : undefined}>{d}</span>
                    {locked ? <Lock size={9} className="text-fg-dim" /> : <span className="font-mono text-[9px] tracking-[0.06em] text-fg-dim">P{phase}</span>}
                  </button>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

function MiniCells({ n, on }: { n: number; on: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn('h-2 w-2 rounded-[2px] border', i < on ? 'border-fg bg-fg' : 'border-border-strong')} />
      ))}
    </div>
  )
}
