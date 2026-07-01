import type { SrsCard, VocabItem } from '../types'

// ---- Date helpers (work in whole days, local time) ----
export function todayISO(): string {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/**
 * SM-2 spaced-repetition algorithm (SuperMemo 2), the basis of Anki.
 * quality: 0-5 (0 = total blackout, 5 = perfect). We map 4 UI buttons:
 *   Again = 2, Hard = 3, Good = 4, Easy = 5
 * Anything < 3 restarts the repetition count (relearn tomorrow).
 */
export function reviewCard(card: SrsCard, quality: number): SrsCard {
  let { repetitions, interval, easeFactor } = card

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  }

  // Update ease factor, clamped to a sensible minimum.
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (easeFactor < 1.3) easeFactor = 1.3

  return {
    ...card,
    repetitions,
    interval,
    easeFactor,
    dueDate: addDays(todayISO(), interval),
  }
}

export function makeCard(item: VocabItem, day: number): SrsCard {
  return {
    id: `${day}:${item.word}`,
    word: item.word,
    ipa: item.ipa,
    meaning_zh: item.meaning_zh,
    example_en: item.example_en,
    day,
    repetitions: 0,
    interval: 0,
    easeFactor: 2.5,
    dueDate: todayISO(), // new cards are due immediately
  }
}

export function dueCards(cards: Record<string, SrsCard>): SrsCard[] {
  const today = todayISO()
  return Object.values(cards)
    .filter((c) => c.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.day - b.day)
}
