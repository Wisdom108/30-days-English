import { useNavigate } from 'react-router-dom'
import { ChevronRight, ArrowRight, Check, Lock } from 'lucide-react'
import { useApp } from '../state'
import { CURRICULUM, TOTAL_DAYS } from '../data/curriculum'
import { isDayComplete, getDayProgress, displayStreak, isDayUnlocked } from '../lib/storage'
import { dueCards } from '../lib/srs'
import { BLOCKS, PHASE_INFO, TOTAL_MINUTES } from '../blocks'
import { Card, CardHead, Segment, Button, Badge, Cells, Collapse } from './ui'
import { BlockIcon } from './blockicons'
import { useCountUp } from '../lib/useCountUp'
import { cn } from '../lib/utils'

const MOD: Record<string, string> = {
  listening: 'Listening',
  vocab: 'Vocab SRS',
  speaking: 'Speaking',
  reading: 'Reading',
  writing: 'Writing',
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
  return h < 11 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { state, unlockAllDays } = useApp()
  const nav = useNavigate()

  const completedDays = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).filter((d) =>
    isDayComplete(state, d),
  )
  const due = dueCards(state.cards).length
  const current = Math.min(state.currentDay, TOTAL_DAYS)
  const streak = displayStreak(state)

  // count-up readouts (hooks — must run before any early return)
  const dayN = useCountUp(current)
  const doneN = useCountUp(completedDays.length)
  const streakN = useCountUp(streak)
  const dueN = useCountUp(due)

  if (CURRICULUM.length === 0) {
    return <div className="py-16 text-center text-fg-muted">课程内容正在生成中…</div>
  }

  const lesson = CURRICULUM.find((l) => l.day === current)
  const phase = lesson?.phase ?? 1
  const dd = String(dayN).padStart(2, '0')

  return (
    <div className="space-y-4">
      {/* ===== HERO — the day, the journey, THE button ===== */}
      <Card className="overflow-hidden">
        <CardHead
          title={greeting()}
          right={
            <Badge>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PHASE_INFO[phase]?.color }} />
              {PHASE_EN[phase]}
            </Badge>
          }
        />
        <div className="flex items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[25px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[29px]">
              {lesson?.title_en ?? lesson?.title_zh}
            </h1>
            <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-muted">
              {TOTAL_DAYS - completedDays.length} days left
            </div>
          </div>
          {/* DAY readout — the ONE Doto hero numeral on this screen */}
          <div className="shrink-0 rounded-lg border border-border-strong bg-surface-2 px-3.5 py-2 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-fg-dim">Day</div>
            <div className="t-doto mt-0.5 text-[44px] font-semibold leading-none text-fg sm:text-[52px]">{dd}</div>
          </div>
        </div>
        {/* whole-journey progress as segmented cells */}
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <Cells value={completedDays.length} max={TOTAL_DAYS} height={8} className="flex-1" />
          <span className="t-tab shrink-0 text-meta text-fg-muted">{doneN}/{TOTAL_DAYS}</span>
        </div>
        {/* the single primary action, above the fold */}
        <div className="px-5 pb-5">
          <Button className="w-full" size="lg" onClick={() => nav(`/day/${current}`)}>
            START DAY {current} <ArrowRight size={16} />
          </Button>
        </div>
      </Card>

      {/* ===== the two numbers that change daily ===== */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border">
        <MCell label="Streak" value={streakN} unit="天"
          bar={<Cells value={Math.min(streak, 10)} max={10} height={7} accent={streak > 0 ? 'var(--color-red)' : undefined} />} />
        <MCell label="Due" value={dueN} unit="卡" red={due > 0} onClick={() => nav('/review')} cls="border-l border-border"
          bar={<Cells value={Math.min(due, 10)} max={10} height={7} accent={due > 0 ? 'var(--color-red)' : undefined} />} />
      </div>

      {/* ===== TODAY — the five blocks ===== */}
      <Card>
        <CardHead
          title={`Today · Day ${current}`}
          right={<span className="label-nd">~{TOTAL_MINUTES} min</span>}
        />
        <div className="p-3">
          <Segment>
            {BLOCKS.map((b, i) => {
              const done = getDayProgress(state, current).completedBlocks[b.key]
              return (
                <button
                  key={b.key}
                  onClick={() => nav(`/day/${current}?b=${b.key}`)}
                  className={cn(
                    'press group grid w-full grid-cols-[24px_24px_1fr_44px_16px] items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-hover sm:gap-3',
                    i > 0 && 'border-t border-border',
                    done && 'opacity-70',
                  )}
                >
                  <span className={cn('grid h-[22px] w-[22px] place-items-center rounded-sm border', done ? 'border-fg bg-fg text-black' : 'border-border-strong')}>
                    {done && <Check size={13} strokeWidth={3} />}
                  </span>
                  <BlockIcon k={b.key} size={18} className="text-fg-secondary" />
                  <span className={cn('min-w-0 truncate text-body font-medium', done ? 'text-fg-muted' : 'text-fg')}>{MOD[b.key] ?? b.title_zh}</span>
                  <span className="t-tab text-right text-body font-medium text-fg-secondary">{b.minutes}′</span>
                  <ChevronRight size={15} className="text-fg-dim opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              )
            })}
          </Segment>
        </div>
      </Card>

      {/* ===== CURRICULUM — 30-day grid ===== */}
      <Card>
        <CardHead
          title="Curriculum · 30D"
          right={<span className="label-nd">{completedDays.length}/{TOTAL_DAYS}</span>}
        />
        {/* phase legend */}
        <div className="flex flex-wrap gap-1.5 border-b border-border px-[18px] py-3">
          {Object.entries(PHASE_INFO).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ background: v.softBg, color: v.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />{PHASE_EN[Number(k)]}
            </span>
          ))}
        </div>
        <div className="p-[18px]">
          <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
            {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((d) => {
              const done = isDayComplete(state, d)
              const locked = !isDayUnlocked(state, d)
              const isCurrent = d === current
              const p = CURRICULUM.find((l) => l.day === d)?.phase ?? 1
              const v = PHASE_INFO[p]
              return (
                <button
                  key={d}
                  disabled={locked}
                  onClick={() => !locked && nav(`/day/${d}`)}
                  aria-label={`Day ${d}${done ? ' 已完成' : locked ? ' 未解锁' : ''}`}
                  className={cn(
                    'press relative grid aspect-square place-items-center rounded-sm border text-center transition-all duration-200',
                    isCurrent && 'border-fg shadow-[0_0_0_1px_var(--color-fg)]',
                    locked ? 'cursor-not-allowed border-border bg-surface-2 opacity-45' : 'hover:border-border-strong hover:shadow-[0_0_14px_-3px_var(--color-fg)] hover:-translate-y-0.5',
                  )}
                  style={done ? { background: v.softBg, borderColor: v.color + '66' } : !locked ? { borderColor: v.color + '40' } : {}}
                >
                  {done && <span className="absolute right-1 top-1" style={{ color: v.color }}><Check size={11} strokeWidth={3} /></span>}
                  {isCurrent && <span className="pulse-red absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-red" />}
                  <span className={cn('t-tab text-h2 font-medium', locked && 'text-fg-dim')} style={done ? { color: v.color } : undefined}>{d}</span>
                  {locked && <Lock size={9} className="text-fg-dim" />}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* ===== method guide — folded, out of the way ===== */}
      <Collapse label="30 天怎么练 · 6 条">
        <div className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </Collapse>
    </div>
  )
}

function MCell({
  label,
  value,
  unit,
  red,
  onClick,
  cls,
  bar,
}: {
  label: string
  value: React.ReactNode // the big Doto DIGITS
  unit?: string // separator/unit — kept in mono, out of the dot-matrix
  red?: boolean
  onClick?: () => void
  cls?: string
  bar?: React.ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'block w-full px-[18px] py-4 text-left sm:py-5',
        onClick && 'press transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        cls,
      )}
    >
      <div className="label-nd">{label}</div>
      <div className={cn('mt-2.5 flex items-baseline gap-1 leading-none', red ? 'text-red' : 'text-fg')}>
        <span className="t-doto text-[30px] font-semibold sm:text-[34px]">{value}</span>
        {unit && <span className="text-sm font-medium text-fg-muted">{unit}</span>}
      </div>
      {bar && <div className="mt-3.5">{bar}</div>}
    </Tag>
  )
}
