import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Lightbulb, Check } from 'lucide-react'
import { BlockIcon } from './blockicons'
import { useApp } from '../state'
import { getLesson } from '../data/curriculum'
import { BLOCKS } from '../blocks'
import type { BlockKey } from '../types'
import { makeCard } from '../lib/srs'
import ListeningBlock from './blocks/ListeningBlock'
import VocabBlock from './blocks/VocabBlock'
import SpeakingBlock from './blocks/SpeakingBlock'
import ReadingBlock from './blocks/ReadingBlock'
import WritingBlock from './blocks/WritingBlock'
import { SpeakButton } from './shared'
import { Badge, Button, Card, CardBody, Callout } from './ui'
import { cn } from '../lib/utils'

export default function DayView() {
  const { day } = useParams()
  const dayNum = Number(day)
  const lesson = getLesson(dayNum)
  const { state, markBlock, addCards } = useApp()
  const nav = useNavigate()

  const hashKey = (window.location.hash.split('#')[2] || '') as BlockKey
  const [active, setActive] = useState<BlockKey>(
    BLOCKS.some((b) => b.key === hashKey) ? hashKey : 'listening',
  )

  useEffect(() => {
    if (lesson) addCards(lesson.vocabulary.map((v) => makeCard(v, lesson.day)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayNum])

  if (!lesson) {
    return (
      <div className="py-16 text-center">
        <p className="text-fg-muted">找不到 Day {day} 的课程内容。</p>
        <Button variant="secondary" className="mt-4" onClick={() => nav('/')}>返回首页</Button>
      </div>
    )
  }

  const prog = state.days[dayNum]?.completedBlocks
  const done = (k: BlockKey) => prog?.[k]
  const complete = (k: BlockKey) => markBlock(dayNum, k)

  return (
    <div className="space-y-4">
      <Card className="animate-in-up">
        <CardBody>
          <div className="flex items-center justify-between">
            <button
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-hover hover:text-fg md:hidden"
              onClick={() => nav('/')}
            >
              <ArrowLeft size={15} /> 首页
            </button>
            <span className="hidden md:block" />
            <Badge variant="accent">阶段 {lesson.phase} · Day {lesson.day}/30</Badge>
          </div>
          <h1 className="mt-3 flex items-center gap-1.5 text-[22px] font-semibold">
            {lesson.title_en} <SpeakButton text={lesson.title_en} />
          </h1>
          <p className="text-[13px] text-fg-muted">{lesson.title_zh} · {lesson.theme}</p>

          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">今日目标</div>
          <ul className="mt-2 space-y-1.5">
            {lesson.goals.map((g, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-fg-secondary">
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

      {/* Segmented block switcher (sticky) */}
      <div className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto rounded-[10px] border border-border bg-surface-2 p-1 md:top-3">
        {BLOCKS.map((b) => (
          <button
            key={b.key}
            onClick={() => setActive(b.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-2 text-[13px] font-medium transition-all duration-200',
              active === b.key ? 'bg-surface text-fg shadow-rest' : 'text-fg-muted hover:text-fg',
            )}
          >
            <BlockIcon k={b.key} size={15} className={active === b.key ? 'text-fg' : 'text-fg-muted'} />
            <span className="hidden sm:inline">{b.title_zh.split(/[ +]/)[0]}</span>
            {done(b.key) && <Check size={13} className="text-success" />}
          </button>
        ))}
      </div>

      <div className="animate-in-up">
        {active === 'listening' && (
          <ListeningBlock lesson={lesson} done={!!done('listening')} onComplete={() => complete('listening')} />
        )}
        {active === 'vocab' && (
          <VocabBlock lesson={lesson} done={!!done('vocab')} onComplete={() => complete('vocab')} />
        )}
        {active === 'speaking' && (
          <SpeakingBlock lesson={lesson} done={!!done('speaking')} onComplete={() => complete('speaking')} />
        )}
        {active === 'reading' && (
          <ReadingBlock lesson={lesson} done={!!done('reading')} onComplete={() => complete('reading')} />
        )}
        {active === 'writing' && (
          <WritingBlock lesson={lesson} done={!!done('writing')} onComplete={() => complete('writing')} />
        )}
      </div>

      <Card>
        <CardBody className="flex items-center justify-center gap-2 py-3.5 text-center">
          <Lightbulb size={15} className="shrink-0 text-warning" />
          <span className="text-[13px] text-fg-muted">{lesson.dailyTip_zh}</span>
        </CardBody>
      </Card>
    </div>
  )
}
