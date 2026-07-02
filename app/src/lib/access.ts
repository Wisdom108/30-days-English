import { config, features } from '../config'

// Auth client. Three server modes (from /me):
//   - 'access'   → Cloudflare Access edge login (redirect flow, cookie)
//   - 'passcode' → a shared passcode gate (stored locally, sent as a header)
//   - 'open'     → no login (anonymous, IP rate-limited)

export type AuthMode = 'access' | 'passcode' | 'open'
export interface Identity {
  email: string
}

const PC_KEY = 'app_pc'
export const getPasscode = (): string => localStorage.getItem(PC_KEY) || ''
export const setPasscode = (v: string): void => localStorage.setItem(PC_KEY, v)

/** Headers to attach to every Worker call (passcode gate; harmless if empty). */
export function authHeaders(): Record<string, string> {
  const pc = getPasscode()
  return pc ? { 'x-app-passcode': pc } : {}
}

/** Who is signed in + which login mode the server uses. */
export async function getIdentity(): Promise<{ user: Identity | null; mode: AuthMode }> {
  if (!features.worker) return { user: null, mode: 'open' }
  try {
    const res = await fetch(`${config.workerUrl}/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
    const data = (await res.json().catch(() => ({}))) as { email: string | null; mode?: AuthMode }
    const mode = data.mode || 'open'
    return { user: res.ok && data.email ? { email: data.email } : null, mode }
  } catch {
    return { user: null, mode: 'open' }
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
