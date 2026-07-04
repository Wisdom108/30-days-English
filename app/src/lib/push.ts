import { config, features } from '../config'
import { authHeaders } from './access'

// Web Push client (§8.2) — payload-free tickles. subscribe() wires the browser
// to the worker: Notification permission → pushManager.subscribe with the VAPID
// applicationServerKey (GET /push/vapid) → POST /push/subscribe. The SW
// (src/sw.ts) turns each tickle into a personalized notification by fetching
// /zaizai/push-preview with its same-origin session cookie.

export function pushSupported(): boolean {
  // iOS exposes PushManager only inside an installed (standalone) PWA — this
  // is exactly the check that flips true after add-to-home-screen.
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Installed to the home screen? (display-mode + legacy iOS navigator.standalone) */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** GET /push/vapid → base64url public key (the applicationServerKey), or null. */
export async function getVapid(): Promise<string | null> {
  try {
    const res = await fetch(`${config.workerUrl}/push/vapid`, { credentials: 'include', headers: authHeaders() })
    if (!res.ok) return null
    const d = (await res.json().catch(() => ({}))) as { publicKey?: string }
    return d.publicKey || null
  } catch {
    return null
  }
}

/** base64url VAPID key → the BufferSource pushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Byte-compare an existing subscription's applicationServerKey to the served one. */
function sameServerKey(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!existing) return false
  const cur = new Uint8Array(existing)
  if (cur.length !== wanted.length) return false
  for (let i = 0; i < cur.length; i++) if (cur[i] !== wanted[i]) return false
  return true
}

/** Full subscribe flow. Never throws — { ok:false, reason } is UI-ready Chinese. */
export async function subscribe(): Promise<{ ok: boolean; reason?: string }> {
  if (!features.worker) return { ok: false, reason: '未配置服务端' }
  if (!pushSupported()) return { ok: false, reason: '此浏览器不支持推送' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: '通知权限被拒绝' }
  const key = await getVapid()
  if (!key) return { ok: false, reason: '服务端推送未配置' }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { ok: false, reason: 'Service Worker 未就绪' } // e.g. vite dev server
  let sub: PushSubscription | null = null
  let fresh = false // did WE create the browser subscription in this call?
  try {
    const appKey = urlBase64ToUint8Array(key)
    sub = await reg.pushManager.getSubscription()
    if (sub && !sameServerKey(sub.options.applicationServerKey, appKey)) {
      // VAPID key rotated (or key unreadable) — the old subscription can never
      // be delivered to with the new key, so drop it and subscribe afresh.
      await sub.unsubscribe().catch(() => {})
      sub = null
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
      fresh = true
    }
    const res = await fetch(`${config.workerUrl}/push/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(sub.toJSON()), // { endpoint, keys:{p256dh,auth} }
    })
    if (!res.ok) {
      // Roll back a subscription we just created — otherwise the toggle would
      // read ON (browser sub exists) with no server row to ever tickle it.
      if (fresh) await sub.unsubscribe().catch(() => {})
      return { ok: false, reason: res.status === 401 ? '请先登录' : '订阅失败,稍后再试' }
    }
    return { ok: true }
  } catch {
    if (fresh && sub) await sub.unsubscribe().catch(() => {})
    return { ok: false, reason: '订阅失败,稍后再试' }
  }
}

/** Tear down both ends; idempotent, best-effort on the server side. */
export async function unsubscribe(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return true
    await fetch(`${config.workerUrl}/push/unsubscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    return sub.unsubscribe()
  } catch {
    return false
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!(await reg?.pushManager.getSubscription())
  } catch {
    return false
  }
}

// Boolean-flavored aliases (Me.tsx PushRow toggle wants plain true/false).
// subscribe() has no boolean alias — callers need the rich reason for their toast.
export const isPushSubscribed = isSubscribed
export const unsubscribePush = unsubscribe
