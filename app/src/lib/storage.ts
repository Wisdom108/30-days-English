import type { AppState, BlockKey, DayProgress, SrsCard } from '../types'
import { todayISO, addDays } from './srs'

export const STORAGE_KEY = 'thirty-days-english:v1'
const KEY = STORAGE_KEY

const emptyBlocks = () => ({
  listening: false,
  vocab: false,
  speaking: false,
  reading: false,
  writing: false,
})

export function defaultState(): AppState {
  return {
    startDate: null,
    currentDay: 1,
    days: {},
    cards: {},
    streak: 0,
    lastStudyDate: null,
    writings: {},
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as AppState
    return { ...defaultState(), ...parsed }
  } catch {
    return defaultState()
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage full or unavailable — ignore */
  }
}

export function getDayProgress(state: AppState, day: number): DayProgress {
  return state.days[day] || { completedBlocks: emptyBlocks() }
}

export function isDayComplete(state: AppState, day: number): boolean {
  const p = getDayProgress(state, day)
  return Object.values(p.completedBlocks).every(Boolean)
}

/** Mark a study block done, updating streak + unlocking the next day when all blocks finish. */
export function completeBlock(state: AppState, day: number, block: BlockKey): AppState {
  const prev = getDayProgress(state, day)
  const completedBlocks = { ...prev.completedBlocks, [block]: true }
  const allDone = Object.values(completedBlocks).every(Boolean)

  const next: AppState = {
    ...state,
    startDate: state.startDate || todayISO(),
    days: {
      ...state.days,
      [day]: {
        completedBlocks,
        completedAt: allDone ? prev.completedAt || todayISO() : prev.completedAt,
      },
    },
  }

  // Streak bookkeeping: count a day toward the streak the first time any block
  // is completed on a new calendar day. Use LOCAL date math (addDays) — the old
  // toISOString() version computed "yesterday" in UTC, so for UTC+8 learners the
  // comparison never matched and the streak reset to 1 every single day.
  const today = todayISO()
  if (next.lastStudyDate !== today) {
    const yesterday = addDays(today, -1)
    next.streak = next.lastStudyDate === yesterday ? state.streak + 1 : 1
    next.lastStudyDate = today
  }

  // Unlock next day once the current day is fully complete.
  if (allDone && day === state.currentDay && day < 30) {
    next.currentDay = day + 1
  }

  return next
}

/** Undo a block completion (re-lock the day if it was the current day). */
export function uncompleteBlock(state: AppState, day: number, block: BlockKey): AppState {
  const prev = getDayProgress(state, day)
  const completedBlocks = { ...prev.completedBlocks, [block]: false }
  const stillComplete = Object.values(completedBlocks).every(Boolean)
  return {
    ...state,
    days: {
      ...state.days,
      [day]: {
        completedBlocks,
        completedAt: stillComplete ? prev.completedAt : undefined,
      },
    },
  }
}

/**
 * The streak that should be DISPLAYED right now. The stored `streak` is only
 * refreshed when a block is completed, so a learner who skipped a day would see
 * a stale number until they study again. If the last study day is neither today
 * nor yesterday, the streak is already broken → show 0.
 */
export function displayStreak(state: AppState): number {
  if (!state.lastStudyDate) return 0
  const today = todayISO()
  if (state.lastStudyDate === today || state.lastStudyDate === addDays(today, -1)) {
    return state.streak
  }
  return 0
}

/** Whether the learner has already studied today (any block completed). */
export function studiedToday(state: AppState): boolean {
  return state.lastStudyDate === todayISO()
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function upsertCards(state: AppState, cards: SrsCard[]): AppState {
  const merged = { ...state.cards }
  for (const c of cards) {
    // Do not overwrite existing SM-2 progress for a card already in the deck.
    if (!merged[c.id]) merged[c.id] = c
  }
  return { ...state, cards: merged }
}

export function updateCard(state: AppState, card: SrsCard): AppState {
  return { ...state, cards: { ...state.cards, [card.id]: card } }
}

export function saveWriting(state: AppState, day: number, text: string): AppState {
  return { ...state, writings: { ...state.writings, [day]: text } }
}

/** Serialize the full learning state for backup. */
export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

/** Parse and validate a backup blob. Returns null if it is not a valid AppState. */
export function parseImport(raw: string): AppState | null {
  try {
    const obj = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null) return null
    // Structural validation: days & cards must be plain objects.
    const okObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
    if (!okObj(obj.days) || !okObj(obj.cards)) return null
    if ('streak' in obj && typeof obj.streak !== 'number') return null
    if ('currentDay' in obj && typeof obj.currentDay !== 'number') return null
    return { ...defaultState(), ...obj }
  } catch {
    return null
  }
}
