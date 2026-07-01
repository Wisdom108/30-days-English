import { Check, RotateCcw } from 'lucide-react'
import { Button } from '../ui'

export default function BlockFooter({
  done,
  onComplete,
  onUndo,
}: {
  done: boolean
  onComplete: () => void
  onUndo?: () => void
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
      {done ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-fg">
          <span className="grid h-4 w-4 place-items-center rounded-sm bg-brand text-brand-fg">
            <Check size={11} strokeWidth={3} />
          </span>
          本模块已完成
        </span>
      ) : (
        <span className="text-sm text-fg-dim">完成后点击右侧打卡</span>
      )}
      {done
        ? onUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo}>
              <RotateCcw size={14} /> 撤销打卡
            </Button>
          )
        : <Button onClick={onComplete}>标记完成</Button>}
    </div>
  )
}
