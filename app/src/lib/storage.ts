import type { AppState, BlockKey, DayProgress, SrsCard } from '../types'
import { todayISO, addDays } from './srs'
import { backfillLessonReviews, scheduleLessonReview } from './lessonReview'

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
    // Days completed before the review ladder shipped get seeded as due now —
    // without this the back catalog would never enter 课程回炉.
    return backfillLessonReviews({ ...defaultState(), ...parsed })
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

/** Whether a day is open to study. Sequential by default; unlockAll frees all
 *  days for learners who already have a foundation and want to jump ahead. */
export function isDayUnlocked(state: AppState, day: number): boolean {
  return state.unlockAll === true || day <= state.currentDay
}

/** Mark a study block done, updating streak + unlocking the next day when all blocks finish.
 *  `bridged` = the caller just consumed a streak freeze covering exactly ONE missed day, so
 *  a 2-day gap counts as consecutive (streak +1 instead of reset).
 *  `today` = the caller's captured local date — a freeze verdict resolved just before
 *  midnight must land on the SAME local day it was computed for. */
export function completeBlock(
  state: AppState,
  day: number,
  block: BlockKey,
  opts?: { bridged?: boolean; today?: string },
): AppState {
  const today = opts?.today ?? todayISO()
  const prev = getDayProgress(state, day)
  const completedBlocks = { ...prev.completedBlocks, [block]: true }
  const allDone = Object.values(completedBlocks).every(Boolean)

  const next: AppState = {
    ...state,
    startDate: state.startDate || today,
    days: {
      ...state.days,
      [day]: {
        completedBlocks,
        completedAt: allDone ? prev.completedAt || today : prev.completedAt,
      },
    },
  }

  // Streak bookkeeping: count a day toward the streak the first time any block
  // is completed on a new calendar day. Use LOCAL date math (addDays) — the old
  // toISOString() version computed "yesterday" in UTC, so for UTC+8 learners the
  // comparison never matched and the streak reset to 1 every single day.
  // Study history — record today once (LOCAL date, capped last 60). A frozen
  // (bridged) day is NOT a studied day and never lands here.
  const dates = state.studyDates ?? []
  if (!dates.includes(today)) next.studyDates = [...dates, today].sort().slice(-60)
  // Freeze bridge: record the covered day into cloud-synced state (drives the ❄
  // cell in the week strip); the legacy localStorage list stays a read-fallback.
  if (opts?.bridged === true) {
    const missed = addDays(today, -1)
    const frozen = state.frozenDates ?? []
    if (!frozen.includes(missed)) next.frozenDates = [...frozen, missed].sort().slice(-60)
  }
  if (next.lastStudyDate !== today) {
    const yesterday = addDays(today, -1)
    const consecutive =
      next.lastStudyDate === yesterday ||
      // freeze bridge: exactly one missed day, covered by a consumed freeze
      (opts?.bridged === true && next.lastStudyDate === addDays(today, -2))
    next.streak = consecutive ? state.streak + 1 : 1
    next.lastStudyDate = today
  }

  // Unlock next day once the current day is fully complete.
  if (allDone && day === state.currentDay && day < 30) {
    next.currentDay = day + 1
  }

  // First full completion starts the lesson's spaced-review ladder (6h → 14d).
  // Guarded on completedAt so re-toggling a block later never resets the ladder.
  if (allDone && !prev.completedAt) {
    next.lessonReviews = scheduleLessonReview(state.lessonReviews, day)
  }

  return next
}

/**
 * Undo a block completion. Clears the day's completedAt if it is no longer
 * fully done. Note: an already-unlocked next day stays unlocked (we never roll
 * currentDay back — that would strand a learner who had moved on).
 */
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
  let added = false
  for (const c of cards) {
    // Do not overwrite existing SM-2 progress for a card already in the deck.
    if (!merged[c.id]) {
      merged[c.id] = c
      added = true
    }
  }
  // No new cards → return the SAME state so callers (e.g. DayView mount) don't
  // churn updatedAt / trigger a needless cloud sync on every day open.
  return added ? { ...state, cards: merged } : state
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
    // studyDates is optional — sanitize rather than reject (old backups lack it).
    if ('studyDates' in obj) {
      if (Array.isArray(obj.studyDates))
        obj.studyDates = obj.studyDates.filter((x: unknown) => typeof x === 'string').slice(-60)
      else delete obj.studyDates
    }
    // frozenDates — same optional-history treatment as studyDates.
    if ('frozenDates' in obj) {
      if (Array.isArray(obj.frozenDates))
        obj.frozenDates = obj.frozenDates.filter((x: unknown) => typeof x === 'string').slice(-60)
      else delete obj.frozenDates
    }
    return { ...defaultState(), ...obj }
  } catch {
    return null
  }
}
