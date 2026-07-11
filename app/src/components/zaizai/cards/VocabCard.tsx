import { useState } from 'react'
import { BookmarkPlus, Check, Volume2 } from 'lucide-react'
import { useApp } from '../../../state'
import { TOTAL_DAYS } from '../../../data/curriculum'
import { makeCard } from '../../../lib/srs'
import { speak } from '../../../lib/speech'
import type { VocabCardPayload } from '../../../lib/zaizai'
import { Button } from '../../ui'
import { cn } from '../../../lib/utils'

// 在在随口甩出的翻转词卡:正面单词+IPA,背面释义+例句,可一键进生词本(SRS)。
export default function VocabCard({ data }: { data: VocabCardPayload }) {
  const { state, addCards } = useApp()
  const [flip, setFlip] = useState(false)
  // Same word may already live in the deck under another day's id — match by word.
  const added = Object.values(state.cards).some((c) => c.word === data.word)

  const add = () => {
    if (added) return
    addCards([
      makeCard(
        { word: data.word, ipa: data.ipa, pos: '', meaning_zh: data.zh, example_en: data.example_en, example_zh: '' },
        Math.min(state.currentDay, TOTAL_DAYS),
      ),
    ])
  }

  return (
    <div className="w-full max-w-[88%]" style={{ perspective: '1200px' }}>
      <div
        role="button"
        tabIndex={0}
        aria-label="翻转词卡"
        aria-pressed={flip}
        onClick={() => setFlip((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setFlip((f) => !f)
          }
        }}
        className="press block w-full cursor-pointer select-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <div className={cn('flip-3d grid w-full', flip && 'flipped')}>
          {/* front — word */}
          <div className="glass-card flip-face col-start-1 row-start-1 flex min-h-[136px] flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center">
            <div className="label-nd">词卡 · 点击翻面</div>
            <div className="text-[28px] font-semibold leading-tight text-fg">{data.word}</div>
            <div className="flex items-center gap-1.5 text-fg-muted">
              {data.ipa && <span className="t-ipa text-body">{data.ipa}</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  speak(data.word)
                }}
                aria-label="朗读"
                className="press grid h-7 w-7 place-items-center rounded-full text-fg-dim transition-colors hover:text-brand"
              >
                <Volume2 size={14} />
              </button>
            </div>
          </div>
          {/* back — meaning + example + add-to-deck */}
          <div className="glass-card flip-face flip-back col-start-1 row-start-1 flex min-h-[136px] flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center">
            <div className="text-h2 font-semibold text-fg">{data.zh}</div>
            {data.example_en && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  speak(data.example_en)
                }}
                className="press text-body italic leading-snug text-fg-secondary"
              >
                “{data.example_en}”
              </button>
            )}
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="secondary" disabled={added} onClick={add}>
                {added ? <Check size={13} /> : <BookmarkPlus size={13} />} {added ? '已在生词本' : '加入生词本'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
