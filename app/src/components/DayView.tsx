import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ArrowRight, Target, SkipForward, PartyPopper } from 'lucide-react'
import { BlockIcon } from './blockicons'
import { useApp } from '../state'
import { getLesson, TOTAL_DAYS } from '../data/curriculum'
import { BLOCKS } from '../blocks'
import type { BlockKey } from '../types'
import { makeCard } from '../lib/srs'
import { isDayComplete, displayStreak } from '../lib/storage'
import ListeningBlock from './blocks/ListeningBlock'
import VocabBlock from './blocks/VocabBlock'
import SpeakingBlock from './blocks/SpeakingBlock'
import ReadingBlock from './blocks/ReadingBlock'
import WritingBlock from './blocks/WritingBlock'
import { Button } from './ui'
import { useToast } from './ui/toast'
import { cn } from '../lib/utils'

const SHORT: Record<BlockKey, string> = {
  listening: '精听',
  vocab: '词汇',
  speaking: '跟读',
  reading: '阅读',
  writing: '写作',
}

export default function DayView() {
  const { day } = useParams()
  const dayNum = Number(day)
  const lesson = getLesson(dayNum)
  const { state, markBlock, unmarkBlock, addCards } = useApp()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useToast()

  const prog = state.days[dayNum]?.completedBlocks
  const done = (k: BlockKey) => !!prog?.[k]
  const dayComplete = isDayComplete(state, dayNum)

  const resolveBlock = (): BlockKey => {
    const b = searchParams.get('b')
    if (b && BLOCKS.some((x) => x.key === b)) return b as BlockKey
    return BLOCKS.find((x) => !done(x.key))?.key ?? BLOCKS[0].key
  }
  const [active, setActive] = useState<BlockKey>(resolveBlock)
  const [goalsOpen, setGoalsOpen] = useState(false)

  useEffect(() => {
    if (lesson) addCards(lesson.vocabulary.map((v) => makeCard(v, lesson.day)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  const wasComplete = useRef(dayComplete)
  useEffect(() => {
    setActive(resolveBlock())
    setGoalsOpen(false)
    wasComplete.current = dayComplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  useEffect(() => {
    if (dayComplete && !wasComplete.current) {
      const s = displayStreak(state)
      toast({
        tone: 'streak',
        title: `🎉 Day ${dayNum} 完成！`,
        description:
          dayNum < TOTAL_DAYS
            ? `连胜 ${s} 天 · 已解锁 Day ${dayNum + 1}`
            : `连胜 ${s} 天 · 全部 30 天完成 🏆`,
      })
    }
    wasComplete.current = dayComplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayComplete])

  if (!lesson) {
    return (
      <div className="py-16 text-center">
        <p className="text-body text-fg-muted">找不到 Day {day} 的课程内容。</p>
        <Button variant="secondary" className="mt-4" onClick={() => nav('/')}>返回首页</Button>
      </div>
    )
  }

  const order = BLOCKS.map((b) => b.key)
  const activeIdx = order.indexOf(active)
  const nextKey = order[activeIdx + 1]

  const complete = (k: BlockKey) => {
    const willComplete = BLOCKS.every((b) => b.key === k || prog?.[b.key])
    markBlock(dayNum, k)
    if (willComplete) return
    // Advance to the next still-incomplete block.
    const nextK = BLOCKS.find((b) => b.key !== k && !prog?.[b.key])?.key
    if (nextK) setActive(nextK)
  }
  const uncomplete = (k: BlockKey) => unmarkBlock(dayNum, k)

  const blockEl = (() => {
    const shared = { lesson, done: done(active), onComplete: () => complete(active), onUndo: () => uncomplete(active) }
    switch (active) {
      case 'listening': return <ListeningBlock {...shared} />
      case 'vocab': return <VocabBlock {...shared} />
      case 'speaking': return <SpeakingBlock {...shared} />
      case 'reading': return <ReadingBlock {...shared} />
      case 'writing': return <WritingBlock {...shared} />
    }
  })()

  return (
    <div className="mx-auto max-w-[560px] pb-28">
      {/* compact header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav('/')}
          aria-label="返回首页"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="label-nd">Day {lesson.day} · 阶段 {lesson.phase}</div>
          <div className="truncate text-h2 font-semibold text-fg">{lesson.title_en}</div>
        </div>
        <button
          onClick={() => setGoalsOpen((o) => !o)}
          aria-label="今日目标"
          aria-expanded={goalsOpen}
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            goalsOpen ? 'border-border-strong bg-elevated text-fg' : 'border-border text-fg-muted hover:text-fg',
          )}
        >
          <Target size={17} />
        </button>
      </div>

      {/* collapsible goals — folded by default so you get to practice fast */}
      <div className={cn('grid transition-[grid-template-rows] duration-300', goalsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="mt-3 rounded-xl border border-border bg-surface-2 p-4">
            <div className="label-nd mb-2">今日目标</div>
            <ul className="space-y-1.5">
              {lesson.goals.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-fg-secondary">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-[1px] bg-red" />{g}
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-border pt-3 text-sm text-fg-muted">
              <span className="font-medium text-fg-secondary">抗遗忘复习 · </span>{lesson.reviewFocus}
            </div>
          </div>
        </div>
      </div>

      {/* step rail — navigation + progress in one */}
      <div role="tablist" aria-label="学习步骤" className="mt-4 flex gap-1.5">
        {BLOCKS.map((b, i) => {
          const isActive = active === b.key
          const isDone = done(b.key)
          return (
            <button
              key={b.key}
              role="tab"
              aria-selected={isActive}
              aria-label={`${SHORT[b.key]}${isDone ? ' 已完成' : ''}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(b.key)}
              className="group flex flex-1 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'relative grid h-10 w-full place-items-center rounded-lg border transition-all',
                  isActive
                    ? 'border-fg text-fg shadow-[0_0_0_1px_var(--color-fg)]'
                    : isDone
                    ? 'border-border-strong text-fg-secondary'
                    : 'border-border text-fg-dim group-hover:text-fg-muted',
                )}
              >
                <BlockIcon k={b.key} size={17} />
                {isDone && (
                  <span className="absolute -right-1 -top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-fg text-black">
                    <Check size={9} strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className={cn('font-mono text-[8.5px] uppercase tracking-[0.06em]', isActive ? 'text-fg' : 'text-fg-dim')}>
                {SHORT[b.key]}
              </span>
              <span className="sr-only">{i + 1}</span>
            </button>
          )
        })}
      </div>

      {/* active block */}
      <div key={`${dayNum}-${active}`} role="tabpanel" tabIndex={0} className="mt-4 animate-in-up">
        {blockEl}
      </div>

      {dayComplete && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-border-strong bg-surface px-5 py-6 text-center animate-in-up">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft"><PartyPopper size={20} className="text-fg" /></div>
          <div>
            <div className="text-h1 font-semibold text-fg"><span className="t-tab">Day {dayNum}</span> 全部完成</div>
            <p className="mt-1 text-sm text-fg-muted">连胜 <span className="t-tab text-fg">{displayStreak(state)}</span> 天 · 保持节奏</p>
          </div>
        </div>
      )}

      {/* persistent advance dock */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
        style={{ background: 'linear-gradient(to top, #000 55%, transparent)' }}>
        <div className="flex gap-2.5">
          {nextKey && (
            <button
              onClick={() => setActive(nextKey)}
              className="grid h-14 shrink-0 place-items-center rounded-xl border border-border bg-surface px-5 text-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span className="flex items-center gap-1.5"><SkipForward size={15} /> 跳过</span>
            </button>
          )}
          {done(active) ? (
            nextKey ? (
              <Button size="lg" className="h-14 flex-1 rounded-xl text-base" onClick={() => setActive(nextKey)}>
                下一步 · {SHORT[nextKey]} <ArrowRight size={18} />
              </Button>
            ) : dayNum < TOTAL_DAYS ? (
              <Button size="lg" className="h-14 flex-1 rounded-xl text-base" onClick={() => nav(`/day/${dayNum + 1}`)}>
                进入 Day {dayNum + 1} <ArrowRight size={18} />
              </Button>
            ) : (
              <Button size="lg" className="h-14 flex-1 rounded-xl text-base" onClick={() => nav('/')}>
                返回首页 <ArrowRight size={18} />
              </Button>
            )
          ) : (
            <Button size="lg" className="h-14 flex-1 rounded-xl text-base" onClick={() => complete(active)}>
              完成{SHORT[active]}{nextKey ? ' · 下一步' : ''} <ArrowRight size={18} />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {order.map((k) => (
            <span key={k} className={cn('h-1 w-6 rounded-full', done(k) ? 'bg-fg' : k === active ? 'bg-red' : 'bg-border-strong')} />
          ))}
        </div>
      </div>
    </div>
  )
}
