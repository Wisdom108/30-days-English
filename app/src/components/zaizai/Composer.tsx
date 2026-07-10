import { memo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ArrowUp, Mic, PhoneCall, Plus, Sparkles, X } from 'lucide-react'
import { useKeyboard } from '../../lib/useKeyboard'
import { Cell, CellGroup } from '../ui'
import { cn } from '../../lib/utils'

// iMessage input dock (v3.2 §5/§6/§11/§12) — owns the draft text locally so
// typing re-renders THIS component only, never the message feed above it.
// Anatomy: full-bleed translucent bar (hairline top) holding an optional mode
// chip row, the 6 high-frequency scenario chips, and the input row =
// [+ round button (Popover: call + all scenario entries)] [capsule field with
// the mic/send key nested at its right edge — mic when empty, blue ↑ when not].
// The `chat-dock` class + useKeyboard glue the bar to the on-screen keyboard.

const PRESETS = ['机场', '点餐', '打车', '酒店', '问路', '购物']

interface ComposerProps {
  busy: boolean
  aiOn: boolean
  scenarioMode: boolean
  roleplay: string | null
  onSend: (text: string) => boolean // false → keep the draft (e.g. not signed in)
  onPreset: (place: string) => void
  onCall: () => void
  onScenarioMode: (on: boolean) => void
  onStopRoleplay: () => void
}

export default memo(function Composer({
  busy,
  aiOn,
  scenarioMode,
  roleplay,
  onSend,
  onPreset,
  onCall,
  onScenarioMode,
  onStopRoleplay,
}: ComposerProps) {
  const [input, setInput] = useState('')
  const [panel, setPanel] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dockRef = useKeyboard<HTMLDivElement>()
  const hasText = input.trim().length > 0

  const submit = () => {
    const t = input.trim()
    if (!t) return
    if (onSend(t)) setInput('')
  }

  const springEase = { transitionTimingFunction: 'var(--ease-back)' } as const

  return (
    <div ref={dockRef} className="chat-dock sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 md:bottom-4 md:mx-0">
      {/* 12px fade above the bar so raw text never peeks under its top edge.
          Plain-CSS gradient (.dock-fade), NOT a Tailwind gradient utility:
          v4 interpolates `in oklab` where any transparent endpoint is
          zero-alpha BLACK, and WebKit doesn't premultiply — renders as a
          dark band on iOS (Tailwind's /0 alpha modifier collapses to
          transparent black too, so same-hue endpoints must be hand-written). */}
      <div className="dock-fade pointer-events-none absolute inset-x-0 -top-3 h-3" aria-hidden="true" />
      <div className="border-t-[0.5px] border-[rgba(60,60,67,0.29)] bg-white/75 px-3 pb-2 pt-2 backdrop-blur-xl md:rounded-2xl md:border-[0.5px]">
        {(roleplay || scenarioMode) && (
          <div className="flex justify-center pb-2">
            {roleplay ? (
              <button
                onClick={onStopRoleplay}
                className="press flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-meta font-medium text-brand"
              >
                演练中 · {roleplay.split(' — ')[0]} <X size={12} />
              </button>
            ) : (
              <button
                onClick={() => onScenarioMode(false)}
                className="press flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-meta font-medium text-brand"
              >
                <Sparkles size={12} /> 自定义场景 · 描述后发送 <X size={12} />
              </button>
            )}
          </div>
        )}

        {aiOn && (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => onPreset(p)}
                disabled={busy}
                className="press card-solid shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-fg-secondary disabled:opacity-45"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* + button — every scenario entry + the call entry live in here */}
          <Popover.Root open={panel} onOpenChange={setPanel}>
            <Popover.Trigger asChild>
              <button
                aria-label="更多操作"
                className="press grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bubble-ai text-fg-secondary"
              >
                <Plus size={17} strokeWidth={2.2} className={cn('transition-transform duration-200', panel && 'rotate-45')} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="start"
                sideOffset={10}
                collisionPadding={12}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="card-solid animate-in-up z-50 w-64 overflow-hidden rounded-2xl shadow-popover"
              >
                <CellGroup className="rounded-none">
                  <Cell
                    onClick={() => {
                      setPanel(false)
                      onCall()
                    }}
                  >
                    <PhoneCall size={16} className="shrink-0 text-brand" /> 语音通话
                  </Cell>
                  <Cell
                    onClick={() => {
                      setPanel(false)
                      onScenarioMode(true)
                      requestAnimationFrame(() => inputRef.current?.focus())
                    }}
                  >
                    <Sparkles size={16} className="shrink-0 text-brand" /> 自定义场景
                  </Cell>
                </CellGroup>
                {aiOn && (
                  <div className="flex flex-wrap gap-1.5 border-t-[0.5px] border-border px-3 py-2.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setPanel(false)
                          onPreset(p)
                        }}
                        disabled={busy}
                        className="press rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-brand disabled:opacity-45"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* capsule field — send/mic key nested at its right edge */}
          <div className="flex min-h-9 min-w-0 flex-1 items-center rounded-[18px] border border-[rgba(60,60,67,0.2)] bg-white/90">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
              disabled={!aiOn}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={!aiOn ? 'AI 未配置 · 任务照常打卡' : scenarioMode ? '描述场景,如:和房东谈租房' : '给在在发消息…'}
              className="h-9 min-w-0 flex-1 bg-transparent pl-3 pr-1 font-sans text-chat text-fg outline-none placeholder:text-fg-dim disabled:opacity-50"
            />
            {/* one slot, two keys: mic (empty) ⇄ blue ↑ (has text), spring scale swap */}
            <div className="relative mr-1 h-7 w-7 shrink-0">
              <button
                onClick={() => onCall()}
                aria-label="语音通话"
                tabIndex={hasText ? -1 : 0}
                aria-hidden={hasText}
                style={springEase}
                className={cn(
                  'absolute inset-0 grid place-items-center rounded-full text-fg-muted transition-[transform,opacity] duration-150',
                  hasText ? 'pointer-events-none scale-50 opacity-0' : 'scale-100 opacity-100',
                )}
              >
                <Mic size={18} />
              </button>
              <button
                onClick={submit}
                disabled={busy || !aiOn || !hasText}
                aria-label="发送"
                tabIndex={hasText ? 0 : -1}
                aria-hidden={!hasText}
                style={springEase}
                className={cn(
                  'absolute inset-0 grid place-items-center rounded-full bg-brand text-brand-fg transition-[transform,opacity] duration-150 disabled:opacity-35',
                  hasText ? 'scale-100 opacity-100' : 'pointer-events-none scale-50 opacity-0',
                )}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
