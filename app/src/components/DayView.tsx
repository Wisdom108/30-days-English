import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Lightbulb, Check, ArrowRight, PartyPopper } from 'lucide-react'
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
import { SpeakButton } from './shared'
import { Badge, Button, Card, CardBody, Callout, SectionLabel } from './ui'
import { useToast } from './ui/toast'
import { cn } from '../lib/utils'

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

  // Which block to open: an explicit ?b= deep-link wins, else the first incomplete one.
  const resolveBlock = (): BlockKey => {
    const b = searchParams.get('b')
    if (b && BLOCKS.some((x) => x.key === b)) return b as BlockKey
    return BLOCKS.find((x) => !done(x.key))?.key ?? BLOCKS[0].key
  }
  const [active, setActive] = useState<BlockKey>(resolveBlock)

  // Seed this day's vocabulary into the SRS deck (idempotent).
  useEffect(() => {
    if (lesson) addCards(lesson.vocabulary.map((v) => makeCard(v, lesson.day)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  // On day change (route param), re-resolve the active block + reset the
  // completion baseline so navigating to an already-done day never re-toasts.
  const wasComplete = useRef(dayComplete)
  useEffect(() => {
    setActive(resolveBlock())
    wasComplete.current = dayComplete
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  // Detect the false→true transition of "whole day complete" → streak toast.
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

  const complete = (k: BlockKey) => {
    const willComplete = BLOCKS.every((b) => b.key === k || prog?.[b.key])
    markBlock(dayNum, k)
    // Day-complete case: the transition effect fires the streak toast.
    if (willComplete) return
    toast({ tone: 'success', title: `✓ ${BLOCKS.find((b) => b.key === k)!.title_zh} 已完成` })
    // Hand-off: auto-advance to the next block still awaiting completion.
    const nextK = BLOCKS.find((b) => b.key !== k && !prog?.[b.key])?.key
    if (nextK) setActive(nextK)
  }
  const uncomplete = (k: BlockKey) => unmarkBlock(dayNum, k)

  return (
    <div className="space-y-4">
      <Card className="animate-in-up">
        <CardBody>
          <div className="flex items-center justify-between">
            <button
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg md:hidden"
              onClick={() => nav('/')}
            >
              <ArrowLeft size={15} /> 首页
            </button>
            <span className="hidden md:block" />
            <Badge variant="accent">阶段 {lesson.phase} · Day {lesson.day}/30</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-2 font-display text-title font-medium">
            {lesson.title_en} <SpeakButton text={lesson.title_en} />
          </h1>
          <p className="text-sm text-fg-muted">{lesson.title_zh} · {lesson.theme}</p>

          <SectionLabel>今日目标</SectionLabel>
          <ul className="-mt-1 space-y-1.5">
            {lesson.goals.map((g, i) => (
              <li key={i} className="flex gap-2 text-sm text-fg-secondary">
                <span className="text-brand">•</span>
                {g}
              </li>
            ))}
          </ul>

          <Callout tone="warning" className="mt-4" icon={<RotateCcw size={15} className="text-warning" />}>
            <span className="font-medium text-warning">抗遗忘复习：</span>
            {lesson.reviewFocus}
          </Callout>
        </CardBody>
      </Card>

      {/* Sticky block switcher — a proper tablist */}
      <div
        role="tablist"
        aria-label="学习模块切换"
        className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-1 md:top-3"
      >
        {BLOCKS.map((b) => {
          const isActive = active === b.key
          const isDone = done(b.key)
          const short = b.title_zh.split(/[ +]/)[0]
          return (
            <button
              key={b.key}
              role="tab"
              aria-selected={isActive}
              aria-label={`${b.title_zh}${isDone ? ' · 已完成' : ''}`}
              onClick={() => setActive(b.key)}
              className={cn(
                'flex min-w-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2.5 text-sm font-medium transition-all duration-200',
                isActive ? 'bg-elevated text-fg shadow-rest' : 'text-fg-muted hover:text-fg',
              )}
            >
              <BlockIcon k={b.key} size={15} className={isActive ? 'text-fg' : 'text-fg-muted'} />
              <span className="hidden sm:inline">{short}</span>
              {isDone && <Check size={13} className="text-fg" strokeWidth={2.5} aria-hidden />}
            </button>
          )
        })}
      </div>

      <div className="animate-in-up" role="tabpanel">
        {active === 'listening' && (
          <ListeningBlock lesson={lesson} done={done('listening')} onComplete={() => complete('listening')} onUndo={() => uncomplete('listening')} />
        )}
        {active === 'vocab' && (
          <VocabBlock lesson={lesson} done={done('vocab')} onComplete={() => complete('vocab')} onUndo={() => uncomplete('vocab')} />
        )}
        {active === 'speaking' && (
          <SpeakingBlock lesson={lesson} done={done('speaking')} onComplete={() => complete('speaking')} onUndo={() => uncomplete('speaking')} />
        )}
        {active === 'reading' && (
          <ReadingBlock lesson={lesson} done={done('reading')} onComplete={() => complete('reading')} onUndo={() => uncomplete('reading')} />
        )}
        {active === 'writing' && (
          <WritingBlock lesson={lesson} done={done('writing')} onComplete={() => complete('writing')} onUndo={() => uncomplete('writing')} />
        )}
      </div>

      {/* Day fully complete → inline hand-off call-to-action */}
      {dayComplete && (
        <Card className="animate-in-up border-border-strong">
          <CardBody className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft">
              <PartyPopper size={20} className="text-fg" />
            </div>
            <div>
              <div className="font-display text-h1 text-fg">Day {dayNum} 全部完成</div>
              <p className="mt-1 text-sm text-fg-muted">
                连胜 <span className="t-num text-fg">{displayStreak(state)}</span> 天 · 保持节奏，明天见
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {dayNum < TOTAL_DAYS ? (
                <Button onClick={() => nav(`/day/${dayNum + 1}`)}>
                  进入 Day {dayNum + 1} <ArrowRight size={15} />
                </Button>
              ) : (
                <Button onClick={() => nav('/progress')}>
                  查看学习进度 <ArrowRight size={15} />
                </Button>
              )}
              <Button variant="secondary" onClick={() => nav('/')}>返回首页</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="flex items-center justify-center gap-2 py-3.5 text-center">
          <Lightbulb size={15} className="shrink-0 text-warning" />
          <span className="text-sm text-fg-muted">{lesson.dailyTip_zh}</span>
        </CardBody>
      </Card>
    </div>
  )
}
