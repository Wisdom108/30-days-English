import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../state'
import { dueCards, reviewCard } from '../lib/srs'
import { SpeakButton } from './shared'
import { Badge, Button, Card, CardBody } from './ui'

const GRADES = [
  { q: 2, label: '重来', hint: '完全忘了', color: '#eb5757' },
  { q: 3, label: '困难', hint: '想了很久', color: '#f2994a' },
  { q: 4, label: '记得', hint: '有点犹豫', color: '#5e6ad2' },
  { q: 5, label: '简单', hint: '脱口而出', color: '#4cb782' },
]

export default function Review() {
  const { state, reviewOne } = useApp()
  const nav = useNavigate()
  const [flip, setFlip] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  const queue = useMemo(() => dueCards(state.cards), [])
  const remaining = queue.slice(reviewed)
  const card = remaining[0]

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
      <Card className="animate-in-up">
        <CardBody className="py-10 text-center">
          <div className="text-[46px]">🎉</div>
          <h2 className="mt-2 text-[20px]">今日复习完成！</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-fg-muted">
            {reviewed > 0 ? `你复习了 ${reviewed} 张词卡。` : '现在没有到期的词卡。'}间隔重复会在最佳时机把它们再送回来。
          </p>
          <Button className="mt-5" onClick={() => nav('/')}>返回首页</Button>
        </CardBody>
      </Card>
    )
  }

  const grade = (q: number) => {
    reviewOne(reviewCard(card, q))
    setReviewed((n) => n + 1)
    setFlip(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          onClick={() => nav('/')}
        >
          <ArrowLeft size={15} /> 首页
        </button>
        <Badge variant="brand">剩余 {remaining.length} 张</Badge>
      </div>

      <button
        onClick={() => setFlip((f) => !f)}
        className="flex min-h-[260px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-border bg-gradient-to-b from-surface-2 to-surface p-8 text-center ring-hairline animate-in-up"
      >
        {!flip ? (
          <>
            <div className="text-[38px] font-semibold">{card.word}</div>
            <div className="text-[18px] text-warning">{card.ipa}</div>
            <SpeakButton text={card.word} />
            <div className="text-[12px] text-fg-dim">点击回忆释义，再翻面</div>
          </>
        ) : (
          <>
            <div className="text-[22px] font-medium">{card.meaning_zh}</div>
            <div className="mt-1 text-[14px] text-fg-secondary">{card.example_en}</div>
            <SpeakButton text={card.example_en} />
          </>
        )}
      </button>

      {flip ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map((g) => (
            <button
              key={g.q}
              onClick={() => grade(g.q)}
              className="flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-white transition-all active:scale-[0.97]"
              style={{ background: g.color, borderColor: g.color }}
            >
              <span className="text-[14px] font-semibold">{g.label}</span>
              <span className="text-[11px] opacity-85">{g.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setFlip(true)}>显示答案</Button>
      )}
      <p className="text-center text-[12px] text-fg-dim">
        SM-2 算法：越熟的词，下次出现间隔越长（1天→3天→1周→2周→1月…）
      </p>
    </div>
  )
}
