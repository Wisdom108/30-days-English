import { Check } from 'lucide-react'
import { Button } from '../ui'

export default function BlockFooter({
  done,
  onComplete,
}: {
  done: boolean
  onComplete: () => void
}) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
      {done ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-success">
          <Check size={15} /> 本模块已完成
        </span>
      ) : (
        <span className="text-[13px] text-fg-dim">完成后点击右侧打卡</span>
      )}
      <Button variant={done ? 'secondary' : 'success'} disabled={done} onClick={onComplete}>
        {done ? '已打卡 ✓' : '标记完成'}
      </Button>
    </div>
  )
}
