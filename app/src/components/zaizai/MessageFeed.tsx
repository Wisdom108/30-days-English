import { memo, type ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import type { AppState } from '../../types'
import type { LessonCtx } from '../../lib/ai'
import { getDayProgress } from '../../lib/storage'
import type {
  AwardCardPayload,
  ChatEntry,
  DrillCardPayload,
  ListenCardPayload,
  NewsCardPayload,
  ReviewCardPayload,
  ScenarioPack,
  TaskCardPayload,
  VocabCardPayload,
} from '../../lib/zaizai'
import { BlockIcon } from '../blockicons'
import ScenarioCard from './ScenarioCard'
import { AwardCard, DrillCard, ListenCard, NewsCard, ReviewCard, VocabCard } from './cards'
import { cn } from '../../lib/utils'

// The chat transcript, extracted from ChatHome and memoized (v3.2 §1/§2/§12):
// identical `entries` reference → the whole list render is skipped, and each
// row is its own memo component so appending one message re-renders one row.
//
// iMessage anatomy: adjacent TEXT bubbles from the same speaker within 60s
// form a group — the corners between them pinch to 4px (speaker's side), only
// the group tail keeps the little curve. A silence of >45min inserts a
// centered timestamp row (今天/昨天/周X/M月D日 + HH:mm).

const GROUP_MS = 60_000
const TS_MS = 45 * 60_000

const isBubble = (e: ChatEntry) => e.kind === 'text' || e.kind === 'brief' || e.kind === 'call-summary'
const chained = (a: ChatEntry, b: ChatEntry) => isBubble(a) && isBubble(b) && a.role === b.role && b.at - a.at < GROUP_MS

function tsParts(at: number): { date: string; time: string } {
  const d = new Date(at)
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  const date =
    days <= 0
      ? '今天'
      : days === 1
        ? '昨天'
        : days < 7
          ? new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(d) // 周X
          : `${d.getMonth() + 1}月${d.getDate()}日`
  return { date, time }
}

/** Stable action surface (ChatHome routes these through a ref) so row memo
 *  isn't defeated by fresh closures every parent render. */
export interface FeedActions {
  task: (t: TaskCardPayload) => void
  practice: (pack: ScenarioPack, brief: string) => void
  call: (scenario?: string) => void
  done: (entryId: string) => void
}

interface RowProps {
  entry: ChatEntry
  state: AppState
  lesson: LessonCtx
  actions: FeedActions
  grp?: 'top' | 'mid' | 'bot'
  tail: boolean
  showTs: boolean
  tight: boolean // grouped with the previous row → 2px gap (else 10px)
  first: boolean
}

const FeedEntry = memo(function FeedEntry({ entry, state, lesson, actions, grp, tail, showTs, tight, first }: RowProps) {
  const mt = showTs || first ? '' : tight ? 'mt-0.5' : 'mt-2.5'
  const ts = showTs ? tsParts(entry.at) : null
  const row = (body: ReactNode, extra?: string | false) => (
    <>
      {ts && (
        <div className={cn('msg-ts pb-1.5', first ? 'pt-1' : 'pt-4')}>
          <span>{ts.date}</span> {ts.time}
        </div>
      )}
      <div className={cn('flex', mt, extra)}>{body}</div>
    </>
  )

  if (entry.kind === 'task-card') {
    const t = entry.payload as TaskCardPayload
    const done = !!getDayProgress(state, t.day).completedBlocks[t.key]
    return row(
      <button
        onClick={() => actions.task(t)}
        className={cn('press glass-card flex w-full max-w-[88%] items-center gap-3 rounded-xl px-4 py-3 text-left', done && 'opacity-60')}
      >
        <BlockIcon k={t.key} size={18} className="shrink-0 text-fg-secondary" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-body font-medium', done ? 'text-fg-muted line-through' : 'text-fg')}>
            {t.title_zh}
          </span>
          <span className="text-meta text-fg-muted">Day {t.day} · {t.minutes} 分钟</span>
        </span>
        {done ? <Check size={15} className="shrink-0 text-success" /> : <ChevronRight size={15} className="shrink-0 text-fg-dim" />}
      </button>,
    )
  }
  if (entry.kind === 'scenario-pack') {
    const pack = entry.payload as ScenarioPack
    return row(
      <ScenarioCard pack={pack} onPractice={(s) => actions.practice(pack, s)} onCall={actions.call} onDone={() => actions.done(entry.id)} />,
    )
  }
  if (entry.kind === 'vocab-card') return row(<VocabCard data={entry.payload as VocabCardPayload} />)
  if (entry.kind === 'drill-card') return row(<DrillCard data={entry.payload as DrillCardPayload} lesson={lesson} />)
  if (entry.kind === 'listen-card') return row(<ListenCard data={entry.payload as ListenCardPayload} />)
  if (entry.kind === 'review-card') return row(<ReviewCard data={entry.payload as ReviewCardPayload} />)
  if (entry.kind === 'award-card') return row(<AwardCard data={entry.payload as AwardCardPayload} />)
  if (entry.kind === 'news-card') return row(<NewsCard data={entry.payload as NewsCardPayload} />)
  if (entry.kind === 'memory-chip') {
    // freeze notices (❄ prefix) are already full sentences — no 记住了 prefix
    const chip = String(entry.payload)
    return row(
      <span className="animate-in-up max-w-[85%] truncate rounded-full bg-surface-2 px-3 py-1 text-meta text-fg-muted">
        {chip.startsWith('❄') ? chip : `在在记住了:${chip}`}
      </span>,
      'justify-center',
    )
  }

  // text / brief / call-summary → an iMessage bubble
  const me = entry.role === 'user'
  return row(
    <div
      className={cn(
        'max-w-[78%] whitespace-pre-wrap font-sans text-chat',
        me ? 'bubble-me' : 'bubble-ai',
        grp && `grp-${grp}`,
        tail && 'bubble-tail',
      )}
    >
      {entry.kind === 'brief' && <div className="mb-0.5 text-[11px] text-fg-muted">今日晨报</div>}
      {String(entry.payload)}
    </div>,
    me && 'justify-end',
  )
})

export default memo(function MessageFeed({
  entries,
  state,
  lesson,
  actions,
}: {
  entries: ChatEntry[]
  state: AppState
  lesson: LessonCtx
  actions: FeedActions
}) {
  return (
    <>
      {entries.map((e, i) => {
        const prev = entries[i - 1]
        const next = entries[i + 1]
        const showTs = !prev || e.at - prev.at > TS_MS
        const linksPrev = !!prev && !showTs && chained(prev, e)
        const linksNext = !!next && next.at - e.at <= TS_MS && chained(e, next)
        return (
          <FeedEntry
            key={e.id}
            entry={e}
            state={state}
            lesson={lesson}
            actions={actions}
            grp={linksPrev && linksNext ? 'mid' : linksNext ? 'top' : linksPrev ? 'bot' : undefined}
            tail={isBubble(e) && !linksNext}
            showTs={showTs}
            tight={linksPrev}
            first={i === 0}
          />
        )
      })}
    </>
  )
})
