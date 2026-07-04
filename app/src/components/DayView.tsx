import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ArrowRight, PartyPopper } from 'lucide-react'
import { BlockIcon } from './blockicons'
import { useApp } from '../state'
import { getLesson, TOTAL_DAYS } from '../data/curriculum'
import { BLOCKS } from '../blocks'
import type { BlockKey } from '../types'
import { addDays, makeCard, todayISO } from '../lib/srs'
import { isDayComplete, displayStreak } from '../lib/storage'
import {
  addFrozenDate, appendChatNotice, consumeFreeze, getWallet, invalidateWallet,
  postEarn, walletCap, type EarnEvent,
} from '../lib/zaizai'
import { useAuth } from '../auth'
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
  const { state, markBlock, addCards } = useApp()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useToast()

  // Fire-and-forget wallet earn — wallet cap + real account only, failures silent.
  const earn = (event: EarnEvent, ref: string) => {
    if (!walletCap() || !user?.account) return
    postEarn(event, ref).then((r) => { if (!r) console.debug('earn skipped', ref) })
  }

  const prog = state.days[dayNum]?.completedBlocks
  const done = (k: BlockKey) => !!prog?.[k]
  const dayComplete = isDayComplete(state, dayNum)

  const resolveBlock = (): BlockKey => {
    const b = searchParams.get('b')
    if (b && BLOCKS.some((x) => x.key === b)) return b as BlockKey
    return BLOCKS.find((x) => !done(x.key))?.key ?? BLOCKS[0].key
  }
  const [active, setActive] = useState<BlockKey>(resolveBlock)

  useEffect(() => {
    if (lesson) addCards(lesson.vocabulary.map((v) => makeCard(v, lesson.day)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  const wasComplete = useRef(dayComplete)
  useEffect(() => {
    setActive(resolveBlock())
    wasComplete.current = dayComplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  useEffect(() => {
    if (dayComplete && !wasComplete.current) {
      const s = displayStreak(state)
      // Post-markBlock state: all 5 blocks just landed → day + streak earns.
      earn('day_complete', `day:${dayNum}`)
      // Catch-up loop: a streak that jumped past a milestone (e.g. 6→8 after a
      // backfill) still claims it — server-side idempotency makes repeats no-ops.
      for (const m of [7, 14, 21, 30]) if (s >= m) earn('streak_milestone', `streak:${m}`)
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

  // Streak freeze: exactly ONE missed local day (lastStudyDate == 前天) + a
  // freeze in the wallet → consume it BEFORE marking, so completeBlock bridges
  // the gap instead of resetting the run. Any failure → normal completion.
  const freezePending = useRef(false)
  const tryFreeze = async (): Promise<boolean> => {
    const today = todayISO()
    if (freezePending.current || !user?.account || !walletCap() || state.lastStudyDate !== addDays(today, -2)) return false
    freezePending.current = true
    try {
      const w = await getWallet()
      if (!w || w.freezes <= 0) return false
      const missed = addDays(today, -1)
      const r = await consumeFreeze(today, missed)
      if (!r?.ok || !r.consumed) return false
      addFrozenDate(missed) // week strip shows ❄ on the covered day
      appendChatNotice(`❄️ 用掉一张冻结券,连胜续上了(还剩 ${r.freezes} 张)`)
      invalidateWallet()
      return true
    } finally {
      freezePending.current = false
    }
  }

  const complete = async (k: BlockKey) => {
    const willComplete = BLOCKS.every((b) => b.key === k || prog?.[b.key])
    const bridged = await tryFreeze()
    markBlock(dayNum, k, bridged ? { bridged: true } : undefined)
    earn('block_complete', `block:${dayNum}:${k}`)
    if (willComplete) return
    // Advance to the next still-incomplete block.
    const nextK = BLOCKS.find((b) => b.key !== k && !prog?.[b.key])?.key
    if (nextK) setActive(nextK)
  }

  const blockEl = (() => {
    switch (active) {
      case 'listening': return <ListeningBlock lesson={lesson} />
      case 'vocab': return <VocabBlock lesson={lesson} />
      case 'speaking': return <SpeakingBlock lesson={lesson} />
      case 'reading': return <ReadingBlock lesson={lesson} />
      case 'writing': return <WritingBlock lesson={lesson} />
    }
  })()

  // ONE full-width dock CTA: 完成X → 下一步 → 进入 Day N+1 → 返回首页.
  const activeDone = done(active)
  const dockAction = () => {
    if (!activeDone) return complete(active)
    if (nextKey) return setActive(nextKey)
    if (dayNum < TOTAL_DAYS) return nav(`/day/${dayNum + 1}`)
    nav('/')
  }
  const dockLabel = !activeDone
    ? <>完成{SHORT[active]}{nextKey ? ' · 下一步' : ''}</>
    : nextKey
    ? <>下一步 · {SHORT[nextKey]}</>
    : dayNum < TOTAL_DAYS
    ? <>进入 Day {dayNum + 1}</>
    : <>返回首页</>

  return (
    <div className="mx-auto max-w-[560px] pb-28">
      {/* compact header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav('/')}
          aria-label="返回首页"
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="label-nd">Day {lesson.day} · 阶段 {lesson.phase}</div>
          <div className="truncate text-[18px] font-semibold tracking-[-0.015em] text-fg">{lesson.title_en}</div>
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
              className="press group flex flex-1 flex-col items-center gap-1.5"
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
                  <span className="animate-slam absolute -right-1 -top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-fg text-bg">
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

      {/* persistent advance dock — one primary CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
        style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}>
        <Button size="lg" className="h-14 w-full rounded-xl text-base" onClick={dockAction}>
          {/* keyed by done-state so the 完成X → 下一步 label change is perceived */}
          <span key={String(activeDone)} className="animate-in-up flex items-center gap-2">
            {dockLabel} <ArrowRight size={18} />
          </span>
        </Button>
      </div>
    </div>
  )
}
