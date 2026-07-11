import { useNavigate } from 'react-router-dom'
import { ChevronRight, Layers } from 'lucide-react'
import type { ReviewCardPayload } from '../../../lib/zaizai'

// 复习提醒卡:到期卡片数 + 深链 /review。
export default function ReviewCard({ data }: { data: ReviewCardPayload }) {
  const nav = useNavigate()
  return (
    <button
      onClick={() => nav('/review')}
      className="press glass-card flex w-full max-w-[88%] items-center gap-3 rounded-xl px-4 py-3 text-left"
    >
      <Layers size={18} className="shrink-0 text-fg-secondary" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-fg">
          <span className="t-tab font-semibold">{data.due}</span> 张卡片到期了
        </span>
        <span className="text-meta text-fg-muted">趁记忆还热,两分钟清掉</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-meta font-medium text-brand">
        去复习 <ChevronRight size={14} />
      </span>
    </button>
  )
}
