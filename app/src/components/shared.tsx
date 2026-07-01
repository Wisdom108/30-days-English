import { useEffect, useRef, useState } from 'react'
import { speak, ttsSupported } from '../lib/speech'
import { lookupWord, type LookupResult } from '../lib/dictionary'

// ---- Text-to-speech play button ----
export function SpeakButton({
  text,
  label = '🔊',
  rate = 1,
  className = 'btn btn-ghost btn-sm btn-icon',
}: {
  text: string
  label?: string
  rate?: number
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  if (!ttsSupported()) return null
  return (
    <button
      className={className}
      title="朗读 / Play"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation()
        setBusy(true)
        await speak(text, rate)
        setBusy(false)
      }}
    >
      {busy ? '🔈' : label}
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

  // Split into tokens keeping punctuation/whitespace, so alphabetic words are clickable.
  const tokens = text.split(/(\s+)/)

  return (
    <>
      <div className="rt" onClick={() => setPopover(null)}>
        {tokens.map((tok, i) => {
          if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>
          const m = tok.match(/^([^A-Za-z']*)([A-Za-z][A-Za-z'-]*)(.*)$/)
          if (!m) return <span key={i}>{tok}</span>
          const [, pre, word, post] = m
          return (
            <span key={i}>
              {pre}
              <span className="w" onClick={(e) => onWord(e, word)}>
                {word}
              </span>
              {post}
            </span>
          )
        })}
      </div>
      {popover && (
        <div className="popover" style={{ left: popover.x, top: popover.y }} onClick={(e) => e.stopPropagation()}>
          <div className="row spread">
            <span className="pw">{popover.word}</span>
            <SpeakButton text={popover.word} />
          </div>
          {popover.loading && <div className="small muted">查询中…</div>}
          {!popover.loading && popover.result && (
            <>
              {popover.result.phonetic && <div className="pph">{popover.result.phonetic}</div>}
              {popover.result.meanings.map((m, i) => (
                <div className="pm small" key={i}>
                  <span className="pos">{m.partOfSpeech}</span>
                  {m.definition}
                </div>
              ))}
            </>
          )}
          {!popover.loading && !popover.result && (
            <div className="small muted">未找到释义（可能离线或生僻词）。</div>
          )}
        </div>
      )}
    </>
  )
}

// ---- Circular progress ring ----
export function ProgressRing({ value, size = 84 }: { value: number; size?: number }) {
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (value / 100) * c
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#334155" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#g)"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .5s ease' }}
      />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ---- Reusable comprehension Q&A with reveal ----
export function QAItem({ q, a }: { q: string; a: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="shadow-item" ref={ref}>
      <div className="row spread">
        <span>{q}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setShow((s) => !s)}>
          {show ? '隐藏' : '看答案'}
        </button>
      </div>
      {show && <div className="small" style={{ marginTop: 6, color: '#86efac' }}>{a}</div>}
    </div>
  )
}
