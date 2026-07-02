import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Layers, PartyPopper } from 'lucide-react'
import { useApp } from '../state'
import { dueCards, reviewCard } from '../lib/srs'
import { SpeakButton } from './shared'
import { Badge, Button, Progress, Kbd, EmptyState } from './ui'
import { cn } from '../lib/utils'

// Grade → SM-2 quality. Monochrome intensity ramp (red reserved for "重来"),
// difficulty easing left→right. No off-palette colors.
const GRADES = [
  { q: 2, label: '重来', hint: '完全忘了', key: '1', cls: 'border-red/40 bg-red-soft text-red hover:bg-red/25 hover:border-red/60' },
  { q: 3, label: '困难', hint: '想了很久', key: '2', cls: 'border-border bg-surface-2 text-fg-muted hover:bg-hover hover:text-fg-secondary' },
  { q: 4, label: '记得', hint: '有点犹豫', key: '3', cls: 'border-border-strong bg-elevated text-fg-secondary hover:bg-hover hover:text-fg' },
  { q: 5, label: '简单', hint: '脱口而出', key: '4', cls: 'border-fg/25 bg-hover text-fg hover:bg-elevated' },
]

export default function Review() {
  const { state, reviewOne } = useApp()
  const nav = useNavigate()
  const [flip, setFlip] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  const queue = useMemo(() => dueCards(state.cards), [])
  const total = queue.length
  const remaining = queue.slice(reviewed)
  const card = remaining[0]

  // Keyboard: space flips, 1-4 grades.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlip((f) => !f)
      } else if (flip && ['1', '2', '3', '4'].includes(e.key)) {
        grade(GRADES[Number(e.key) - 1].q)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, flip])

  if (Object.keys(state.cards).length === 0) {
    return (
      <EmptyState
        icon={<Layers size={22} />}
        title="还没有词卡"
        description="开始学习后，每天的新词会自动加入间隔复习队列。"
        action={<Button onClick={() => nav('/')}>去学习</Button>}
      />
    )
  }

  if (!card) {
    return (
      <EmptyState
        icon={<PartyPopper size={22} className="text-fg" />}
        title="今日复习完成"
        description={`${reviewed > 0 ? `你复习了 ${reviewed} 张词卡。` : '现在没有到期的词卡。'}间隔重复会在最佳时机把它们再送回来。`}
        action={<Button onClick={() => nav('/')}>返回首页</Button>}
      />
    )
  }

  function grade(q: number) {
    reviewOne(reviewCard(card, q))
    setReviewed((n) => n + 1)
    setFlip(false)
  }

  return (
    <div className="mx-auto max-w-[460px] space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          onClick={() => nav('/')}
        >
          <ArrowLeft size={15} /> 首页
        </button>
        <Badge variant="accent">剩余 {remaining.length} 张</Badge>
      </div>
      <Progress value={total ? (reviewed / total) * 100 : 0} />

      {/* 3D flip card (div, not button — it contains SpeakButtons) */}
      <div className="[perspective:1200px]">
        <div
          role="button"
          tabIndex={0}
          aria-label="翻转词卡"
          onClick={() => setFlip((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlip((f) => !f) }
          }}
          className={cardFlipCls(flip)}
          style={{ minHeight: 300 }}
        >
          <div className="flip-face absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
            <div className="text-display font-semibold text-fg">{card.word}</div>
            <div className="font-mono text-h2 text-fg-muted">{card.ipa}</div>
            <SpeakButton text={card.word} />
            <div className="text-meta text-fg-muted">
              点击回忆释义，再翻面 · <Kbd>Space</Kbd> 翻转
            </div>
          </div>
          <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
            <div className="text-h1 font-medium text-fg">{card.meaning_zh}</div>
            <div className="text-body-lg text-fg-secondary">{card.example_en}</div>
            <SpeakButton text={card.example_en} />
          </div>
        </div>
      </div>

      {flip ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map((g) => (
            <button
              key={g.q}
              onClick={() => grade(g.q)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border py-2.5 transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                g.cls,
              )}
            >
              <span className="text-body font-semibold">{g.label}</span>
              <span className="flex items-center gap-1 text-label opacity-80">
                <Kbd>{g.key}</Kbd> {g.hint}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setFlip(true)}>显示答案</Button>
      )}
      <p className="text-center text-meta text-fg-muted">
        SM-2 间隔重复：越熟的词，下次出现间隔越长（1天 → 3天 → 1周 → 2周 → 1月…）
      </p>
    </div>
  )
}

function cardFlipCls(flipped: boolean) {
  return `flip-3d relative block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40${flipped ? ' flipped' : ''}`
}
