import { useEffect, useState } from 'react'
import { Volume2, Loader2, Rabbit } from 'lucide-react'
import { speak, ttsSupported } from '../lib/speech'
import { lookupWord, type LookupResult } from '../lib/dictionary'
import { cn } from '../lib/utils'

// ---- Text-to-speech play button ----
export function SpeakButton({
  text,
  slow = false,
  rate = 1,
  className,
}: {
  text: string
  slow?: boolean
  rate?: number
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  if (!ttsSupported()) return null
  return (
    <button
      className={cn(
        'inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg',
        className,
      )}
      title={slow ? '慢速朗读' : '朗读'}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        setBusy(true)
        await speak(text, slow ? 0.7 : rate)
        setBusy(false)
      }}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : slow ? (
        <Rabbit size={15} />
      ) : (
        <Volume2 size={15} />
      )}
    </button>
  )
}

// ---- Reading text with click-to-define words ----
export function ReadableText({ text }: { text: string }) {
  const [popover, setPopover] = useState<{
    x: number
    y: number
    word: string
    result: LookupResult | null
    loading: boolean
  } | null>(null)

  useEffect(() => {
    const close = () => setPopover(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [])

  const onWord = async (e: React.MouseEvent, word: string) => {
    e.stopPropagation()
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = Math.min(rect.left, window.innerWidth - 340)
    const y = rect.bottom + 6
    setPopover({ x, y, word, result: null, loading: true })
    speak(word)
    const result = await lookupWord(word)
    setPopover((p) => (p && p.word === word ? { ...p, result, loading: false } : p))
  }

  const tokens = text.split(/(\s+)/)

  return (
    <>
      <div className="text-[16.5px] leading-[2] text-fg" onClick={() => setPopover(null)}>
        {tokens.map((tok, i) => {
          if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>
          const m = tok.match(/^([^A-Za-z']*)([A-Za-z][A-Za-z'-]*)(.*)$/)
          if (!m) return <span key={i}>{tok}</span>
          const [, pre, word, post] = m
          return (
            <span key={i}>
              {pre}
              <span
                className="cursor-pointer rounded px-0.5 transition-colors hover:bg-accent-soft"
                onClick={(e) => onWord(e, word)}
              >
                {word}
              </span>
              {post}
            </span>
          )
        })}
      </div>
      {popover && (
        <div
          className="fixed z-50 max-w-[320px] rounded-[10px] border border-border bg-surface p-3.5 shadow-[var(--shadow-popover)] animate-in-up"
          style={{ left: popover.x, top: popover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[16px] font-semibold text-fg">{popover.word}</span>
            <SpeakButton text={popover.word} />
          </div>
          {popover.loading && <div className="mt-1 text-[13px] text-fg-muted">查询中…</div>}
          {!popover.loading && popover.result && (
            <>
              {popover.result.phonetic && (
                <div className="text-[13px] text-warning">{popover.result.phonetic}</div>
              )}
              {popover.result.meanings.map((mm, idx) => (
                <div className="mt-1.5 text-[13px] text-fg-secondary" key={idx}>
                  <span className="mr-1 italic text-fg-muted">{mm.partOfSpeech}</span>
                  {mm.definition}
                </div>
              ))}
            </>
          )}
          {!popover.loading && !popover.result && (
            <div className="mt-1 text-[13px] text-fg-muted">未找到释义（可能离线或生僻词）。</div>
          )}
        </div>
      )}
    </>
  )
}

// ---- Circular progress ring (solid single-color stroke) ----
export function ProgressRing({
  value,
  size = 88,
  stroke = 7,
  color = 'var(--color-brand)',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (value / 100) * c
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#262626" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

// ---- Comprehension Q&A row (Notion database-row hover) ----
export function QAItem({ q, a }: { q: string; a: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="border-b border-border-soft transition-colors last:border-0 hover:bg-hover">
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <span className="text-[14px] text-fg">{q}</span>
        <button
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-brand transition-colors hover:bg-accent-soft"
          onClick={() => setShow((s) => !s)}
        >
          {show ? '隐藏' : '看答案'}
        </button>
      </div>
      {show && <div className="px-3.5 pb-3 text-[13px] text-success">{a}</div>}
    </div>
  )
}

// ---- Wrapper that groups rows into a hairline-bordered list container ----
export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[8px] border border-border">{children}</div>
}
