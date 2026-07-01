import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../state'
import { dueCards, reviewCard } from '../lib/srs'
import { SpeakButton } from './shared'
import { Badge, Button, Progress } from './ui'

const GRADES = [
  { q: 2, label: '重来', hint: '完全忘了', color: '#dc2626', soft: '#fcebeb' },
  { q: 3, label: '困难', hint: '想了很久', color: '#d9930a', soft: '#fbf3e2' },
  { q: 4, label: '记得', hint: '有点犹豫', color: '#2e7cf6', soft: '#eaf2fe' },
  { q: 5, label: '简单', hint: '脱口而出', color: '#0e9f6e', soft: '#e7f5ef' },
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
      <div className="py-16 text-center">
        <p className="text-fg-muted">还没有词卡。开始学习后，每天的新词会自动加入复习队列。</p>
        <Button className="mt-4" onClick={() => nav('/')}>去学习</Button>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-[460px] py-10 text-center animate-in-up">
        <div className="text-[46px]">🎉</div>
        <h2 className="mt-2 text-[20px] font-semibold">今日复习完成！</h2>
        <p className="mt-2 text-[14px] text-fg-muted">
          {reviewed > 0 ? `你复习了 ${reviewed} 张词卡。` : '现在没有到期的词卡。'}间隔重复会在最佳时机把它们再送回来。
        </p>
        <Button className="mt-5" onClick={() => nav('/')}>返回首页</Button>
      </div>
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
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-hover hover:text-fg"
          onClick={() => nav('/')}
        >
          <ArrowLeft size={15} /> 首页
        </button>
        <Badge variant="accent">剩余 {remaining.length} 张</Badge>
      </div>
      <Progress value={total ? (reviewed / total) * 100 : 0} />

      {/* 3D flip card */}
      <div className="[perspective:1200px]">
        <button
          onClick={() => setFlip((f) => !f)}
          className={cardFlipCls(flip)}
          style={{ minHeight: 300 }}
        >
          <div className="flip-face absolute inset-0 flex flex-col items-center justify-center gap-2.5 rounded-[12px] border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
            <div className="font-display text-[44px] font-medium text-fg">{card.word}</div>
            <div className="font-mono text-[16px] text-fg-muted">{card.ipa}</div>
            <SpeakButton text={card.word} />
            <div className="text-[12px] text-fg-muted">点击回忆释义，再翻面（空格键翻转）</div>
          </div>
          <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[12px] border border-border bg-surface p-8 shadow-[var(--shadow-card)]">
            <div className="text-[22px] font-medium text-fg">{card.meaning_zh}</div>
            <div className="text-[15px] text-fg-secondary">{card.example_en}</div>
            <SpeakButton text={card.example_en} />
          </div>
        </button>
      </div>

      {flip ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map((g, i) => (
            <button
              key={g.q}
              onClick={() => grade(g.q)}
              className="flex flex-col items-center gap-0.5 rounded-[8px] border py-2.5 transition-all duration-150 hover:brightness-[0.98] active:scale-[0.97]"
              style={{ background: g.soft, borderColor: g.color + '33', color: g.color }}
            >
              <span className="text-[14px] font-semibold">{g.label}</span>
              <span className="text-[11px] opacity-80">{i + 1} · {g.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setFlip(true)}>显示答案</Button>
      )}
      <p className="text-center text-[12px] text-fg-muted">
        SM-2 算法：越熟的词，下次出现间隔越长（1天→3天→1周→2周→1月…）
      </p>
    </div>
  )
}

function cardFlipCls(flipped: boolean) {
  return `flip-3d relative block w-full text-left${flipped ? ' flipped' : ''}`
}
