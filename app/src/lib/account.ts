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

/** Merge local + cloud learning state, never losing progress from either side:
 *  a block completed anywhere stays completed; SRS cards keep whichever copy
 *  has advanced further; writings keep the longer draft. */
export function mergeStates(a: AppState, b: AppState): AppState {
  const out: AppState = { ...defaultState() }

  // days — OR the block completion of both sides
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

  // cards — keep the more-practiced copy of each
  out.cards = { ...a.cards }
  for (const [id, cb] of Object.entries(b.cards)) {
    const ca = out.cards[id]
    out.cards[id] =
      !ca ||
      cb.repetitions > ca.repetitions ||
      (cb.repetitions === ca.repetitions && cb.dueDate > ca.dueDate)
        ? cb
        : ca
  }

  // scalars — most-progressed / earliest-start wins
  out.currentDay = Math.max(a.currentDay, b.currentDay)
  const later = (a.lastStudyDate || '') >= (b.lastStudyDate || '') ? a : b
  out.streak = later.streak
  out.lastStudyDate = later.lastStudyDate
  out.startDate =
    a.startDate && b.startDate
      ? a.startDate < b.startDate ? a.startDate : b.startDate
      : a.startDate || b.startDate
  out.guideDismissed = a.guideDismissed || b.guideDismissed
  out.unlockAll = a.unlockAll || b.unlockAll

  // writings — keep the longer draft per day
  out.writings = { ...a.writings }
  for (const [d, text] of Object.entries(b.writings)) {
    const cur = out.writings[Number(d)]
    if (!cur || text.length > cur.length) out.writings[Number(d)] = text
  }

  return out
}
