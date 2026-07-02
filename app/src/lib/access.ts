import { config, features } from '../config'

// Cloudflare Access auth (Zero Trust). The Worker's /ai, /speech and /me routes
// are protected by an Access application; login happens on Cloudflare's hosted
// page. The browser holds the Access session cookie, so authenticated calls just
// need `credentials: 'include'` — no bearer token to manage on the client.

export interface Identity {
  email: string
}

/** Who is signed in, or null. Polls the Worker's /me (Access-verified). */
export async function getIdentity(): Promise<Identity | null> {
  if (!features.worker) return null
  try {
    const res = await fetch(`${config.workerUrl}/me`, { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { email: string | null }
    return data.email ? { email: data.email } : null
  } catch {
    return null
  }
}

/** Send the user through the Cloudflare Access login, then back to the app. */
export function login(): void {
  const back = window.location.href
  window.location.href = `${config.workerUrl}/login?redirect=${encodeURIComponent(back)}`
}

/** Clear the Cloudflare Access session and return to the app. */
export function logout(): void {
  const back = window.location.origin + window.location.pathname
  window.location.href = `${config.workerUrl}/logout?redirect=${encodeURIComponent(back)}`
}
