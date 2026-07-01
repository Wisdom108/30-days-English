import type { AppState, BlockKey, DayProgress, SrsCard } from '../types'
import { todayISO } from './srs'

const KEY = 'thirty-days-english:v1'

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
  // is completed on a new calendar day.
  const today = todayISO()
  if (next.lastStudyDate !== today) {
    const yesterday = (() => {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    })()
    next.streak = next.lastStudyDate === yesterday ? state.streak + 1 : 1
    next.lastStudyDate = today
  }

  // Unlock next day once the current day is fully complete.
  if (allDone && day === state.currentDay && day < 30) {
    next.currentDay = day + 1
  }

  return next
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
