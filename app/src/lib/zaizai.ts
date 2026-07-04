import { config, features } from '../config'
import { authHeaders } from './access'
import { AIError, type ChatMsg, type LessonCtx } from './ai'
import { serverCaps, type ServerCaps } from './caps'
import { todayISO } from './srs'
import type { BlockKey } from '../types'

// 在在 (Zaizai) client — messenger endpoints + wallet + the local chat/memory
// stores. All day stamps use LOCAL dates (srs.ts todayISO) — NEVER toISOString:
// a UTC+8 morning is still "yesterday" in UTC (the old streak bug).

export interface ScenarioPack {
  title_zh: string
  role_zh: string
  opener_en: string
  phrases: { en: string; zh: string }[]
  words: { word: string; ipa: string; zh: string }[]
}

export interface ZaizaiStats {
  day: number
  blocksDoneToday: number
  streak: number
  dueCards: number
}

export interface WalletInfo {
  balanceSeconds: number
  badges: string[]
  ledger: { delta: number; reason: string; at: number }[]
  rules: Record<string, { seconds: number; dailyCap: number }>
  callCost: number
}

export type EarnEvent = 'block_complete' | 'day_complete' | 'scenario_complete' | 'streak_milestone'

// ---- rich-card payloads (§8.1) ----
export interface VocabCardPayload {
  word: string
  ipa: string
  zh: string
  example_en: string
}
export interface DrillCardPayload {
  text: string
  tip?: string
}
export interface ListenCardPayload {
  text: string
  label?: string
}
export interface ReviewCardPayload {
  due: number
}
export interface AwardCardPayload {
  seconds?: number
  badge?: string
}
export interface NewsCardPayload {
  title: string
  level: string
  summary_en: string
  glossary: { word: string; zh: string }[]
  source: string
}

/** /ai/zaizai chat response — 在在 may attach ONE contextual card + the memory
 *  facts it just extracted (both optional; older workers return reply only). */
export interface ZaizaiChatResponse {
  reply: string
  card?: { kind?: string; data?: unknown }
  remembered?: string[]
}

/** Narrow an untrusted worker `card` into a renderable entry (llama output —
 *  validate shape, trim strings) or null if it's garbage. */
export function cardEntry(
  card: ZaizaiChatResponse['card'],
): { kind: 'vocab-card' | 'drill-card' | 'listen-card'; payload: VocabCardPayload | DrillCardPayload | ListenCardPayload } | null {
  const d = (card?.data || null) as Record<string, unknown> | null
  if (!d) return null
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '')
  if (card?.kind === 'vocab-card' && str('word'))
    return { kind: 'vocab-card', payload: { word: str('word'), ipa: str('ipa'), zh: str('zh'), example_en: str('example_en') } }
  if (card?.kind === 'drill-card' && str('text'))
    return { kind: 'drill-card', payload: { text: str('text'), tip: str('tip') || undefined } }
  if (card?.kind === 'listen-card' && str('text'))
    return { kind: 'listen-card', payload: { text: str('text'), label: str('label') || undefined } }
  return null
}

// ---- AI endpoints (same post pattern as ai.ts) ----
async function post<T>(path: string, body: unknown): Promise<T> {
  if (!features.ai) throw new AIError('AI 未配置')
  const res = await fetch(`${config.workerUrl}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new AIError('请先登录')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AIError((data as { error?: string }).error || `请求失败 (${res.status})`)
  return data as T
}

export function zaizaiChat(
  messages: ChatMsg[],
  lesson: LessonCtx,
  stats?: ZaizaiStats,
  localMemory?: string,
): Promise<ZaizaiChatResponse> {
  return post('/ai/zaizai', { messages, lesson, mode: 'chat', stats, localMemory })
}

/** GET /ai/news — VOA-simplified daily news (worker caches 6h). Silent-fail →
 *  null; callers just skip the card. */
export async function fetchNews(): Promise<NewsCardPayload | null> {
  if (!features.ai) return null
  try {
    const res = await fetch(`${config.workerUrl}/ai/news`, { credentials: 'include', headers: authHeaders() })
    if (!res.ok) return null
    const d = (await res.json().catch(() => null)) as (Partial<NewsCardPayload> & { news?: Partial<NewsCardPayload> }) | null
    const n = d?.news ?? d // tolerate both `{news:{…}}` and bare payload
    if (!n || typeof n.title !== 'string' || !n.title.trim()) return null
    return {
      title: n.title.trim(),
      level: typeof n.level === 'string' ? n.level : '',
      summary_en: typeof n.summary_en === 'string' ? n.summary_en : '',
      glossary: Array.isArray(n.glossary)
        ? n.glossary.filter((g): g is { word: string; zh: string } => !!g && typeof g.word === 'string' && typeof g.zh === 'string').slice(0, 8)
        : [],
      source: typeof n.source === 'string' ? n.source : '',
    }
  } catch {
    return null
  }
}

export function zaizaiBrief(stats: ZaizaiStats, lesson: LessonCtx, localMemory?: string): Promise<{ reply: string }> {
  return post('/ai/zaizai', { messages: [], lesson, mode: 'brief', stats, localMemory })
}

export function genScenario(place: string, lesson: LessonCtx): Promise<{ pack: ScenarioPack }> {
  return post('/ai/scenario', { place, lesson })
}

/** Fold a pack into the compact roleplay-context string fed to chat/call prompts. */
export function packToScenario(pack: ScenarioPack): string {
  return `${pack.title_zh} — ${pack.role_zh}. Opener: ${pack.opener_en}`.slice(0, 400)
}

// ---- wallet (independent fetch + credentials; module-level cache) ----
/** Fired whenever the balance may have changed — chips re-fetch on it. */
export const WALLET_EVENT = 'zaizai-wallet'
let walletCache: WalletInfo | null = null

/** Worker reports the wallet feature (`wallet` lands in ServerCaps via /health). */
export function walletCap(): boolean {
  return !!(serverCaps() as ServerCaps & { wallet?: boolean }).wallet
}

/** Drop the cached wallet + tell chips to re-fetch — call on login/logout/account switch. */
export function invalidateWallet(): void {
  walletCache = null
  window.dispatchEvent(new Event(WALLET_EVENT))
}

export async function getWallet(force = false): Promise<WalletInfo | null> {
  if (!features.worker) return null
  if (walletCache && !force) return walletCache
  try {
    const res = await fetch(`${config.workerUrl}/wallet`, { credentials: 'include', headers: authHeaders() })
    if (!res.ok) {
      if (res.status === 401) walletCache = null // session gone — stale balance must not linger
      return null
    }
    walletCache = (await res.json()) as WalletInfo
    return walletCache
  } catch {
    return null
  }
}

/** Fire-and-forget earn. Replayed ref / hit cap → earned:0 (not an error);
 *  guests and network failures → null, silently. */
export async function postEarn(
  event: EarnEvent,
  ref: string,
): Promise<{ balanceSeconds: number; earned: number; newBadges: string[] } | null> {
  if (!features.worker) return null
  try {
    const res = await fetch(`${config.workerUrl}/earn`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ event, ref, day: todayISO() }), // LOCAL date — worker validates format + ±36h
    })
    if (!res.ok) return null
    const d = (await res.json()) as { balanceSeconds: number; earned: number; newBadges: string[] }
    invalidateWallet()
    return d
  } catch {
    return null
  }
}

// ---- local chat store ----
// `memory-chip` = the subtle system line "在在记住了:…" after memory extraction.
export type ChatKind =
  | 'text'
  | 'task-card'
  | 'scenario-pack'
  | 'brief'
  | 'call-summary'
  | 'vocab-card'
  | 'drill-card'
  | 'listen-card'
  | 'review-card'
  | 'award-card'
  | 'news-card'
  | 'memory-chip'
export interface TaskCardPayload {
  day: number
  key: BlockKey
  title_zh: string
  minutes: number
}
export interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  kind: ChatKind
  payload:
    | string
    | TaskCardPayload
    | ScenarioPack
    | VocabCardPayload
    | DrillCardPayload
    | ListenCardPayload
    | ReviewCardPayload
    | AwardCardPayload
    | NewsCardPayload
  at: number
}

const CHAT_KEY = 'zaizai:chat:v1'
const CHAT_MAX = 60

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadChat(): ChatEntry[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY)
    const list = raw ? (JSON.parse(raw) as ChatEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveChat(entries: ChatEntry[]): void {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(entries.slice(-CHAT_MAX)))
  } catch {
    /* storage full — drop */
  }
}

// ---- guest local memory (account users get D1 memories server-side) ----
const MEM_KEY = 'zaizai:memory:v1'
const MEM_MAX = 12

export function loadLocalMemory(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(MEM_KEY) || '[]') as string[]
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function pushLocalMemory(note: string): void {
  const t = note.trim().slice(0, 200)
  if (!t) return
  try {
    const list = loadLocalMemory().filter((x) => x !== t)
    list.push(t)
    localStorage.setItem(MEM_KEY, JSON.stringify(list.slice(-MEM_MAX)))
  } catch {
    /* ignore */
  }
}

export function localMemoryText(): string {
  return loadLocalMemory().join('\n')
}

// ---- morning-brief stamp (local date) ----
const BRIEF_KEY = 'zaizai:brief:date'

export function briefShownToday(): boolean {
  try {
    return localStorage.getItem(BRIEF_KEY) === todayISO()
  } catch {
    return true // storage broken → never spam the brief
  }
}

export function markBriefShown(): void {
  try {
    localStorage.setItem(BRIEF_KEY, todayISO())
  } catch {
    /* ignore */
  }
}

// ---- daily scenario counter (earn ref `scenario:{date}:{n}`) ----
const SCEN_KEY = 'zaizai:scenario:v1'

export function nextScenarioRef(): string {
  const date = todayISO()
  let n = 1
  try {
    const raw = JSON.parse(localStorage.getItem(SCEN_KEY) || 'null') as { date: string; n: number } | null
    if (raw && raw.date === date && Number.isFinite(raw.n)) n = raw.n + 1
  } catch {
    /* fresh */
  }
  try {
    localStorage.setItem(SCEN_KEY, JSON.stringify({ date, n }))
  } catch {
    /* ignore */
  }
  return `scenario:${date}:${n}`
}
