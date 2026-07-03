import { useEffect, useState, type ReactNode } from 'react'
import { Volume2, Loader2, Rabbit } from 'lucide-react'
import { speak, ttsSupported } from '../lib/speech'
import { lookupWord, type LookupResult } from '../lib/dictionary'
import type { GlossaryItem } from '../types'
import { cn } from '../lib/utils'

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

// Strip a trailing Chinese gloss "English Title (中文)" → "English Title" so the
// English never gets uppercased-next-to-CJK (the "中英混杂" jumble).
export function titleEn(s = ''): string {
  return s.replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim()
}

// ---- Shared block-hero header: Chinese action tag + English title, cleanly
// separated so zh chrome and en content never collide on one uppercase line. ----
export function BlockHead({
  tag,
  title,
  right,
}: {
  tag: string // Chinese action word, e.g. 精听 / 跟读
  title?: string // lesson title (English, Chinese gloss auto-stripped)
  right?: ReactNode
}) {
  const t = titleEn(title)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="shrink-0 text-body font-semibold text-fg">{tag}</span>
        {t && (
          <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.12em] text-fg-muted">
            {t}
          </span>
        )}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </div>
  )
}

// ---- Text-to-speech play button (44px tap target, small glyph) ----
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
        'inline-grid h-11 w-11 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg',
        RING,
        className,
      )}
      title={slow ? '慢速朗读' : '朗读'}
      aria-label={slow ? '慢速朗读' : '朗读'}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        setBusy(true)
        await speak(text, slow ? 0.7 : rate)
        setBusy(false)
      }}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : slow ? (
        <Rabbit size={16} />
      ) : (
        <Volume2 size={16} />
      )}
    </button>
  )
}

// ---- Reading text with click-to-define words ----
// Curated per-lesson glossary is checked FIRST (instant + offline); the network
// dictionary is a supplement for phonetics / fuller English definitions.
export function ReadableText({ text, glossary = [], serif }: { text: string; glossary?: GlossaryItem[]; serif?: boolean }) {
  const gloss = new Map(glossary.map((g) => [g.word.toLowerCase(), g.meaning_zh]))

  const [popover, setPopover] = useState<{
    x: number
    y: number
    word: string
    meaning_zh?: string
    result: LookupResult | null
    loading: boolean
  } | null>(null)

  useEffect(() => {
    const close = () => setPopover(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [])

  const onWord = async (el: HTMLElement, word: string) => {
    const rect = el.getBoundingClientRect()
    const x = Math.min(rect.left, window.innerWidth - 340)
    const y = rect.bottom + 6
    const meaning_zh = gloss.get(word.toLowerCase())
    setPopover({ x, y, word, meaning_zh, result: null, loading: true })
    speak(word)
    const result = await lookupWord(word)
    setPopover((p) => (p && p.word === word ? { ...p, result, loading: false } : p))
  }

  const tokens = text.split(/(\s+)/)

  return (
    <>
      {/* NB: don't combine `text-read` with `text-[17px]` — both are font-size
          utilities, so tailwind-merge drops text-read (and its 1.85 leading).
          Serif path sets its own size + leading explicitly. */}
      <div className={cn('text-fg', serif ? 't-serif text-[17px] leading-[1.75]' : 'text-read')} onClick={() => setPopover(null)}>
        {tokens.map((tok, i) => {
          if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>
          const m = tok.match(/^([^A-Za-z']*)([A-Za-z][A-Za-z'-]*)(.*)$/)
          if (!m) return <span key={i}>{tok}</span>
          const [, pre, word, post] = m
          const known = gloss.has(word.toLowerCase())
          // Glossary words are real buttons (keyboard + AT accessible); plain
          // words stay pointer-only to avoid flooding the tab order.
          return (
            <span key={i}>
              {pre}
              {known ? (
                <button
                  type="button"
                  aria-label={`查词 ${word}`}
                  className={cn(
                    'cursor-pointer rounded-sm px-0.5 underline decoration-dotted decoration-fg-muted underline-offset-4 transition-colors hover:bg-accent-soft',
                    RING,
                  )}
                  onClick={(e) => { e.stopPropagation(); onWord(e.currentTarget, word) }}
                >
                  {word}
                </button>
              ) : (
                <span
                  className="cursor-pointer rounded-sm px-0.5 transition-colors hover:bg-accent-soft"
                  onClick={(e) => { e.stopPropagation(); onWord(e.currentTarget, word) }}
                >
                  {word}
                </span>
              )}
              {post}
            </span>
          )
        })}
      </div>
      {popover && (
        <div
          className="fixed z-50 max-w-[320px] rounded-xl border border-border bg-surface p-3.5 shadow-[var(--shadow-popover)] animate-in-up"
          style={{ left: popover.x, top: popover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-h2 font-semibold text-fg">{popover.word}</span>
            <SpeakButton text={popover.word} />
          </div>
          {popover.meaning_zh && (
            <div className="mt-1 text-body text-fg">{popover.meaning_zh}</div>
          )}
          {popover.result?.phonetic && (
            <div className="mt-1 font-mono text-sm text-fg-muted">{popover.result.phonetic}</div>
          )}
          {popover.loading && !popover.meaning_zh && (
            <div className="mt-1 text-sm text-fg-muted">查询中…</div>
          )}
          {!popover.loading &&
            popover.result?.meanings.slice(0, 2).map((mm, idx) => (
              <div className="mt-1.5 text-sm text-fg-secondary" key={idx}>
                <span className="mr-1 italic text-fg-muted">{mm.partOfSpeech}</span>
                {mm.definition}
              </div>
            ))}
          {!popover.loading && !popover.result && !popover.meaning_zh && (
            <div className="mt-1 text-sm text-fg-muted">未找到释义（可能离线或生僻词）。</div>
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
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-border)" strokeWidth={stroke} fill="none" />
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
          style={{ transition: 'stroke-dashoffset .38s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

// ---- Comprehension Q&A row (hover/click-reveal answer) ----
export function QAItem({ q, a }: { q: string; a: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="border-b border-border-soft transition-colors last:border-0 hover:bg-hover">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <span className="text-body text-fg">{q}</span>
        <button
          className="inline-grid h-9 shrink-0 place-items-center rounded-md px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          onClick={() => setShow((s) => !s)}
          aria-expanded={show}
        >
          {show ? '隐藏' : '看答案'}
        </button>
      </div>
      {show && <div className="px-3.5 pb-3 text-sm text-fg-secondary">{a}</div>}
    </div>
  )
}

// ---- Wrapper that groups rows into a sharp hairline-bordered segment ----
export function RowGroup({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-sm border border-border bg-surface-2">{children}</div>
}
