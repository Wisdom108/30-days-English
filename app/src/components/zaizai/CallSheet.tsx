import { Sheet } from '../ui'
import { AiPartner } from '../blocks/SpeakingBlock'
import type { LessonCtx } from '../../lib/ai'

// Bottom sheet wrapping the existing realtime voice partner (free CF / Grok
// tier chain lives inside AiPartner — nothing re-implemented here). Radix
// unmounts the content on close, so mic/WS sessions end with the sheet.
export default function CallSheet({
  open,
  onOpenChange,
  lesson,
  scenario,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  lesson: LessonCtx
  scenario?: string
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title={scenario ? '场景实战通话' : '语音陪练'}
      className="flex flex-col overflow-hidden"
    >
      {/* bounded flex column: header stays put, the transcript area scrolls */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <AiPartner lesson={lesson} scenario={scenario} />
      </div>
    </Sheet>
  )
}
