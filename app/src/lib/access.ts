import { config, features } from '../config'

// Auth client. Four server modes (from /me):
//   - 'account'  → D1 membership: username/password + activation-code membership
//   - 'access'   → Cloudflare Access edge login (redirect flow, cookie)
//   - 'passcode' → a shared passcode gate (stored locally, sent as a header)
//   - 'open'     → no login (anonymous, IP rate-limited)

export type AuthMode = 'account' | 'access' | 'passcode' | 'open'
const isMode = (v: unknown): v is AuthMode =>
  v === 'account' || v === 'access' || v === 'passcode' || v === 'open'

// Last mode successfully reported by /me. A failed probe (offline PWA cold
// start, transient worker 5xx) must NOT fall back to 'open' — that unmounts
// the login UI for the whole session. Reuse the last known-good mode instead;
// 'open' only before the first ever successful probe.
const MODE_KEY = 'auth:last-mode'
const lastKnownMode = (): AuthMode => {
  const v = localStorage.getItem(MODE_KEY)
  return isMode(v) ? v : 'open'
}

// Whether the latest getIdentity() probe failed — AuthProvider re-probes on
// 'online'/tab-wake only while this is set, so a healthy session never re-polls.
let fetchFailed = false
export const identityFetchFailed = (): boolean => fetchFailed
export interface Identity {
  email: string // display name (username in account mode)
  member?: boolean
  memberUntil?: number | null
  account?: boolean // real D1 session (cloud sync) vs passcode/Access "owner"
}

const PC_KEY = 'app_pc'
export const getPasscode = (): string => localStorage.getItem(PC_KEY) || ''
export const setPasscode = (v: string): void => {
  localStorage.setItem(PC_KEY, v)
  // Mirror to a same-origin cookie — WebSocket upgrades can't carry custom
  // headers, so the worker reads the passcode from `app_pc` on WS auth.
  document.cookie = v
    ? `app_pc=${encodeURIComponent(v)}; path=/; max-age=31536000; SameSite=Lax; Secure`
    : 'app_pc=; path=/; max-age=0; SameSite=Lax; Secure'
}

/** Headers to attach to every Worker call (passcode gate; harmless if empty). */
export function authHeaders(): Record<string, string> {
  const pc = getPasscode()
  return pc ? { 'x-app-passcode': pc } : {}
}

/** Who is signed in + which login mode the server uses. */
export async function getIdentity(): Promise<{ user: Identity | null; mode: AuthMode }> {
  if (!features.worker) return { user: null, mode: 'open' }
  // One-time boot sync: users who saved the passcode before the cookie mirror
  // existed have it only in localStorage — write the cookie so WS auth works.
  const pc = getPasscode()
  if (pc && !document.cookie.includes('app_pc=')) setPasscode(pc)
  try {
    const res = await fetch(`${config.workerUrl}/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as {
      email: string | null
      mode?: AuthMode
      member?: boolean
      memberUntil?: number | null
      account?: boolean
    }
    if (!isMode(data.mode)) {
      // Modeless body (non-JSON 5xx, gateway error page) — treat as a failed probe.
      fetchFailed = true
      return { user: null, mode: lastKnownMode() }
    }
    fetchFailed = false
    try {
      localStorage.setItem(MODE_KEY, data.mode)
    } catch {
      /* storage broken — mode just won't persist */
    }
    return {
      user:
        res.ok && data.email
          ? { email: data.email, member: data.member, memberUntil: data.memberUntil ?? null, account: data.account }
          : null,
      mode: data.mode,
    }
  } catch {
    fetchFailed = true
    return { user: null, mode: lastKnownMode() }
  }
}

/** Cloudflare Access: redirect through the hosted login, then back to the app. */
export function accessLogin(): void {
  const back = window.location.href
  window.location.href = `${config.workerUrl}/login?redirect=${encodeURIComponent(back)}`
}

export function logout(): void {
  const back = window.location.origin + window.location.pathname
  window.location.href = `${config.workerUrl}/logout?redirect=${encodeURIComponent(back)}`
}
