import { json, callAI, type Env } from './index'
import { readSession } from './session'
import { GUARD } from './prompts'

// Web Push (v3.1) — payload-free "tickle" notifications. The server never
// encrypts a payload (no RFC 8291): the service worker wakes on `push`, fetches
// /zaizai/push-preview with its same-origin session cookie, and shows that
// sentence via showNotification. VAPID auth is a hand-rolled ES256 JWT
// (WebCrypto, RFC 8292): aud = push-service origin, exp = now+12h, sub = mailto.
// Keys: VAPID_PUBLIC_KEY (wrangler.toml var, base64url raw P-256 point — the
// browser's applicationServerKey) + VAPID_PRIVATE_KEY (secret, PKCS8 base64).

const VAPID_SUB = 'mailto:hello@thinkuniverse.workers.dev'
const NO_PUSH = '推送未启用'

export function pushEnabled(env: Env): boolean {
  return !!(env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY && env.DB)
}

// ---------------------------------------------------------------- VAPID JWT
const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Import once per isolate (cron sends many tickles with the same key).
let keyCache: { secret: string; key: CryptoKey } | null = null
async function signingKey(env: Env): Promise<CryptoKey> {
  const secret = env.VAPID_PRIVATE_KEY || ''
  if (keyCache?.secret === secret) return keyCache.key
  const der = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)) // PKCS8, base64
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  keyCache = { secret, key }
  return key
}

/** ES256 VAPID JWT for one push-service origin. */
async function vapidJwt(env: Env, aud: string): Promise<string> {
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64url(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB })),
  )
  const data = `${head}.${body}`
  // WebCrypto ECDSA already emits the raw r||s form JWS wants (not DER).
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), enc.encode(data))
  return `${data}.${b64url(new Uint8Array(sig))}`
}

/** POST an empty tickle to one endpoint. Returns the push service's status. */
async function sendTickle(env: Env, endpoint: string, jwt: string): Promise<number> {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, TTL: '86400' },
  })
  r.body?.cancel().catch(() => {}) // response text is irrelevant — free the connection
  return r.status
}

// ---------------------------------------------------------------- endpoints
/** GET /push/vapid → { publicKey } — the applicationServerKey for subscribe(). */
export function handleVapid(req: Request, env: Env): Response {
  if (!pushEnabled(env)) return json({ error: NO_PUSH }, env, 503, req)
  return json({ publicKey: env.VAPID_PUBLIC_KEY }, env, 200, req)
}

/** POST /push/subscribe { endpoint, keys:{p256dh,auth} } — upsert (endpoint PK,
 *  so a re-subscribed device or a handed-over browser profile just re-owns it). */
export async function handlePushSubscribe(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !pushEnabled(env) || !env.SESSION_SECRET) return json({ error: NO_PUSH }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: unknown
    keys?: { p256dh?: unknown; auth?: unknown }
  }
  const endpoint = String(body.endpoint || '').slice(0, 1024)
  const p256dh = String(body.keys?.p256dh || '').slice(0, 256)
  const auth = String(body.keys?.auth || '').slice(0, 128)
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return json({ error: '无效的订阅' }, env, 400, req)
  await db
    .prepare(
      'INSERT INTO push_subs (user_id, endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ' +
        'ON CONFLICT(endpoint) DO UPDATE SET user_id = ?1, p256dh = ?3, auth = ?4',
    )
    .bind(userId, endpoint, p256dh, auth, Date.now())
    .run()
  return json({ ok: true }, env, 200, req)
}

/** POST /push/unsubscribe { endpoint } — own rows only; idempotent. */
export async function handlePushUnsubscribe(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_PUSH }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown }
  const endpoint = String(body.endpoint || '').slice(0, 1024)
  if (endpoint) {
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(endpoint, userId).run()
  }
  return json({ ok: true }, env, 200, req)
}

// ---------------------------------------------------------------- cron sender
// How long a synced progress blob counts as "fresh" — the evening cron and the
// evening preview MUST share this cutoff, or the rescue copy would contradict
// who actually got tickled.
const PROGRESS_FRESH_MS = 14 * 3_600_000

/** Cron `0 23 * * *` UTC (= 北京 07:00): tickle every subscription. */
export async function sendMorningTickles(env: Env): Promise<void> {
  const db = env.DB
  if (!db || !pushEnabled(env)) return
  let subs: { endpoint: string }[]
  try {
    subs = (await db.prepare('SELECT endpoint FROM push_subs').all<{ endpoint: string }>()).results
  } catch {
    return
  }
  await tickleAll(env, db, subs)
}

/** Cron `0 12 * * *` UTC (= 北京 20:00): evening rescue — only subscribers whose
 *  synced progress blob has NOT moved in the last 14h (no progress row counts
 *  as stale too: they have never synced, exactly who needs the nudge). */
export async function sendEveningTickles(env: Env): Promise<void> {
  const db = env.DB
  if (!db || !pushEnabled(env)) return
  let subs: { endpoint: string }[]
  try {
    subs = (
      await db
        .prepare(
          'SELECT s.endpoint FROM push_subs s LEFT JOIN progress p ON p.user_id = s.user_id ' +
            'WHERE p.updated_at IS NULL OR p.updated_at < ?',
        )
        .bind(Date.now() - PROGRESS_FRESH_MS)
        .all<{ endpoint: string }>()
    ).results
  } catch {
    return
  }
  await tickleAll(env, db, subs)
}

/** Shared tickle loop. Per-sub errors are swallowed (one dead endpoint must not
 *  stop the batch); 404/410 responses prune the row. JWTs are cached per
 *  push-service origin. */
async function tickleAll(env: Env, db: D1Database, subs: { endpoint: string }[]): Promise<void> {
  const jwts = new Map<string, string>()
  const BATCH = 20 // modest bursts — stays far from the subrequest ceiling
  for (let i = 0; i < subs.length; i += BATCH) {
    await Promise.all(
      subs.slice(i, i + BATCH).map(async ({ endpoint }) => {
        try {
          const origin = new URL(endpoint).origin
          let jwt = jwts.get(origin)
          if (!jwt) {
            jwt = await vapidJwt(env, origin)
            jwts.set(origin, jwt)
          }
          const status = await sendTickle(env, endpoint, jwt)
          if (status === 404 || status === 410) {
            await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run()
          }
        } catch {
          /* swallowed by design */
        }
      }),
    )
  }
}

// ---------------------------------------------------------------- push preview
const PREVIEW_FALLBACK = '早上好,在在等你来练今天的英语,先开口说一句?'
const PREVIEW_FALLBACK_PM = '今天还没见你来练英语,在在有点惦记——回来说一句就好?'

/** GET /zaizai/push-preview → { text } — one personalized line built from the
 *  top-3 memories + the synced progress blob. The SW fetches this on `push`
 *  (session cookie rides along) and shows it as the notification body.
 *  Half-day branch on the UTC clock (the crons fire on UTC too): hour 11–19 →
 *  evening copy (recap when today's progress is fresh, streak rescue when not),
 *  anything else → morning copy. KV-cached per user per UTC half-day. */
export async function handlePushPreview(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_PUSH }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const nowDate = new Date()
  const evening = nowDate.getUTCHours() >= 11 && nowDate.getUTCHours() < 20
  const day = nowDate.toISOString().slice(0, 10) // UTC on purpose: cache key only, never user-facing
  const key = `pv:${userId}:${day}:${evening ? 'pm' : 'am'}`
  const cached = await env.QUOTA.get(key)
  if (cached) return json({ text: cached }, env, 200, req)

  const facts: string[] = []
  let progressFresh = false // moved within PROGRESS_FRESH_MS — mirrors the evening cron filter
  try {
    const { results } = await db
      .prepare('SELECT text FROM memories WHERE user_id = ? ORDER BY weight DESC, updated_at DESC LIMIT 3')
      .bind(userId)
      .all<{ text: string }>()
    for (const r of results) facts.push(r.text)
    const prog = await db
      .prepare('SELECT data, updated_at FROM progress WHERE user_id = ?')
      .bind(userId)
      .first<{ data: string; updated_at: number }>()
    if (prog?.data) {
      progressFresh = prog.updated_at > Date.now() - PROGRESS_FRESH_MS
      const blob = JSON.parse(prog.data) as { days?: Record<string, unknown>; streak?: number } | null
      const dayCount = blob?.days && typeof blob.days === 'object' ? Object.keys(blob.days).length : 0
      if (dayCount > 0) facts.push(`学员已学到 Day ${Math.min(dayCount, 30)}/30`)
      if (typeof blob?.streak === 'number' && blob.streak > 0) facts.push(`已连续学习 ${Math.round(blob.streak)} 天`)
    }
  } catch {
    /* stats are garnish — a bare line still works */
  }
  const fallback = evening && !progressFresh ? PREVIEW_FALLBACK_PM : PREVIEW_FALLBACK
  const task = evening
    ? progressFresh
      ? '任务:晚间复盘——学员今天已经练过了。夸一个具体的点,再轻轻带一句明天继续。'
      : '任务:连胜挽救——学员今天还没来练。语气是牵挂,不是指责,绝不羞辱;' +
        '若事实里有连续学习天数,点出这个数字值得守住;邀请学员现在回来练一句。'
    : '任务:晨呼——把学员拉回来今天练英语。'
  try {
    const raw = await callAI(env, {
      system:
        'You are 在在, a warm-but-teasing bilingual study buddy inside a 30-day English course app. ' +
        'Write EXACTLY ONE short Chinese push-notification sentence (at most 40 Chinese characters). ' +
        task +
        ' Reference one concrete given fact when available. ' +
        'No 亲爱的-style greetings, no emoji, no quotes, no AI clichés. ' +
        GUARD,
      messages: [
        { role: 'user', content: facts.length ? `事实:\n${facts.join('\n')}` : '没有额外事实,写一句通用但不客套的话。' },
      ],
      max_tokens: 300,
    })
    const text = String(raw).trim().replace(/\s+/g, ' ').slice(0, 80) || fallback
    await env.QUOTA.put(key, text, { expirationTtl: 26 * 3600 })
    return json({ text }, env, 200, req)
  } catch {
    // Never fail the notification path; the fallback is not cached so a later
    // wake the same half-day can still get a personalized line.
    return json({ text: fallback }, env, 200, req)
  }
}
