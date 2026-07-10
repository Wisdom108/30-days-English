import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, PartyPopper } from 'lucide-react'
import { useApp } from '../state'
import { dueCards, reviewCard } from '../lib/srs'
import { SpeakButton } from './shared'
import { Badge, Button, Progress, Kbd, EmptyState } from './ui'
import { cn } from '../lib/utils'

// Grade → SM-2 quality. Three grades only（四档让用户在"困难/记得"间空耗判断）：
// 重来 q=2 重学，记得 q=4，简单 q=5。Red reserved for "重来". Keys 1/2/3.
const GRADES = [
  { q: 2, label: '重来', hint: '完全忘了', key: '1', cls: 'border-red/40 bg-red-soft text-red hover:bg-red/25 hover:border-red/60' },
  { q: 4, label: '记得', hint: '有点犹豫', key: '2', cls: 'border-border-strong bg-elevated text-fg-secondary hover:bg-hover hover:text-fg' },
  { q: 5, label: '简单', hint: '脱口而出', key: '3', cls: 'border-fg/25 bg-hover text-fg hover:bg-elevated' },
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

  // Keyboard: space flips, 1-3 grades.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlip((f) => !f)
      } else if (flip && ['1', '2', '3'].includes(e.key)) {
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
        description={`${reviewed > 0 ? `你复习了 ${reviewed} 张词卡。` : '现在没有到期的词卡。'}越熟的词，下次出现间隔越长——间隔重复会在最佳时机把它们再送回来。`}
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
      {/* back navigation lives in the global sub-page header — one progress row here */}
      <div className="flex items-center gap-3">
        <Progress value={total ? (reviewed / total) * 100 : 0} className="min-w-0 flex-1" />
        <Badge variant="accent" className="shrink-0">剩余 {remaining.length} 张</Badge>
      </div>

      {/* 3D flip card — keyed by card id so the next card mounts fresh at the
          front face（否则回翻过渡会先闪出下一张卡的背面）。 */}
      <div key={card.id} className="animate-in-up [perspective:1200px]">
        <div
          role="button"
          tabIndex={0}
          aria-label="翻转词卡"
          onClick={() => setFlip((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlip((f) => !f) }
          }}
          className={cardFlipCls(flip)}
          style={{ minHeight: 340 }}
        >
          {/* front — hidden while flipped: aria-hidden + inert (tabIndex 兜底)
              keep the invisible face's buttons out of AT + tab order */}
          <div
            aria-hidden={flip}
            tabIndex={-1}
            {...(flip ? { inert: '' } : {})}
            className="flip-face absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="label-nd">Word · <span className="t-tab text-fg-secondary">{reviewed + 1}/{total}</span></span>
              <span className="label-nd hidden md:inline">Tap · Space</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <div className="text-[46px] font-semibold leading-none text-fg">{card.word}</div>
              <div className="t-ipa text-h2 text-fg-muted">{card.ipa}</div>
              <SpeakButton text={card.word} />
            </div>
          </div>
          {/* back — hidden until flipped (same treatment) */}
          <div
            aria-hidden={!flip}
            tabIndex={-1}
            {...(flip ? {} : { inert: '' })}
            className="flip-face flip-back absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="label-nd">Meaning</span>
              <SpeakButton text={card.example_en} />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
              <div className="text-h1 font-medium text-fg">{card.meaning_zh}</div>
              <div className="text-body-lg text-fg-secondary">{card.example_en}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed-height slot：显示答案 ↔ 评分区互换不跳版 */}
      <div className="h-[76px]">
        {flip ? (
          <div className="grid h-full grid-cols-3 gap-2">
            {GRADES.map((g, i) => (
              <button
                key={g.q}
                onClick={() => grade(g.q)}
                // backwards（非 both）：入场结束后释放 transform，让 .press 能缩放
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}
                className={cn(
                  'press animate-in-up flex flex-col items-center justify-center gap-1 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  g.cls,
                )}
              >
                <span className="text-body-lg font-semibold">{g.label}</span>
                <span className="flex items-center gap-1 text-label opacity-80">
                  <span className="hidden md:inline-flex"><Kbd>{g.key}</Kbd></span>
                  {g.hint}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Button className="h-full w-full" onClick={() => setFlip(true)}>显示答案</Button>
        )}
      </div>
    </div>
  )
}

function cardFlipCls(flipped: boolean) {
  return `press flip-3d relative block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40${flipped ? ' flipped' : ''}`
}
