// Account / membership client for the D1-backed Worker backend.
//   POST /auth/register|login|logout|activate · GET/PUT /progress
// Sessions ride an HttpOnly cookie (same-origin), so every call just needs
// credentials:'include'. All errors surface as Error(中文消息) for direct display.
import { config } from '../config'
import type { AppState, DayProgress } from '../types'
import { defaultState } from './storage'

export interface AccountUser {
  name: string
  member: boolean
  memberUntil: number | null
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.workerUrl}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : '请求失败，请重试')
  return data as T
}

export const register = (username: string, password: string) =>
  req<{ user: AccountUser }>('POST', '/auth/register', { username, password }).then((r) => r.user)

export const login = (username: string, password: string) =>
  req<{ user: AccountUser }>('POST', '/auth/login', { username, password }).then((r) => r.user)

export const accountLogout = () => req<unknown>('POST', '/auth/logout').catch(() => {})

export const activateCode = (code: string) =>
  req<{ user: AccountUser }>('POST', '/auth/activate', { code }).then((r) => r.user)

// ---- Progress cloud sync -----------------------------------------------

export const pullProgress = () =>
  req<{ data: AppState | null; updatedAt: number | null }>('GET', '/progress')

export const pushProgress = (state: AppState) =>
  req<{ updatedAt: number }>('PUT', '/progress', { data: state })

/** Merge local + cloud learning state.
 *  - Completion (days/blocks) is MONOTONIC → union (never un-completes).
 *  - Editable fields (writings, SRS cards, streak) are LAST-WRITER-WINS by
 *    `updatedAt`: the more recently written side wins per key, so a newer rewrite
 *    (even if shorter) or a legitimately failed review (reps reset) is preserved
 *    instead of being resurrected by an older device's stale copy. */
export function mergeStates(a: AppState, b: AppState): AppState {
  const out: AppState = { ...defaultState() }
  const newer = (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b
  const older = newer === a ? b : a

  // days — OR the block completion of both sides (monotonic; safe to union)
  const dayKeys = new Set([...Object.keys(a.days), ...Object.keys(b.days)])
  for (const k of dayKeys) {
    const day = Number(k)
    const da = a.days[day]
    const db = b.days[day]
    if (!da || !db) {
      out.days[day] = (da || db) as DayProgress
      continue
    }
    const blocks = { ...da.completedBlocks }
    for (const bk of Object.keys(db.completedBlocks) as (keyof typeof blocks)[]) {
      blocks[bk] = blocks[bk] || db.completedBlocks[bk]
    }
    out.days[day] = { completedBlocks: blocks, completedAt: da.completedAt || db.completedAt }
  }

  // cards — union of ids; the NEWER side wins on a shared card (so a reset-on-fail
  // is kept, not overwritten by an older higher-repetitions copy)
  out.cards = { ...older.cards, ...newer.cards }

  // writings — union of days; the NEWER side wins on a shared day (a shorter
  // rewrite is a legitimate edit, not data to discard)
  out.writings = { ...older.writings, ...newer.writings }

  // currentDay — monotonic (max); streak/lastStudyDate — last-writer-wins
  out.currentDay = Math.max(a.currentDay, b.currentDay)
  out.streak = newer.streak
  out.lastStudyDate = newer.lastStudyDate
  out.startDate =
    a.startDate && b.startDate
      ? a.startDate < b.startDate ? a.startDate : b.startDate
      : a.startDate || b.startDate
  out.guideDismissed = a.guideDismissed || b.guideDismissed
  out.unlockAll = a.unlockAll || b.unlockAll
  out.updatedAt = Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0)

  return out
}
