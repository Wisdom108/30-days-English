import { json, underQuota, bump, type Env } from './index'
import {
  makeSessionCookie,
  clearSessionCookie,
  readSession,
  makeSalt,
  hashPassword,
  verifyPassword,
} from './session'

// Membership backend (Cloudflare D1): username/password accounts, activation-code
// membership, cloud progress sync. All handlers degrade to 503 until the DB
// binding + SESSION_SECRET exist — the rest of the Worker runs exactly as before.

const USERNAME_RE = /^[a-zA-Z0-9_一-龥]{3,20}$/ // letters/digits/_/CJK, 3-20 chars
const MAX_PROGRESS_CHARS = 200_000 // serialized progress blob cap
const LOGIN_FAIL_CAP = 30 // failed password attempts per IP per day
const REGISTER_CAP = 5 // successful registrations per IP per day (mass-signup brake)
// Fixed decoy salt+hash so a login for a NON-existent user still spends one
// PBKDF2 — equalizes timing so latency can't enumerate usernames.
const DUMMY_SALT = '00000000000000000000000000000000'
const DUMMY_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

interface UserRow {
  id: number
  username: string
  member_until: number | null
}

/** Public user shape returned by every auth endpoint. */
function userShape(row: { username: string; member_until: number | null }) {
  const until = row.member_until ?? null
  return { name: row.username, member: until !== null && until > Date.now(), memberUntil: until }
}

/** Attach a Set-Cookie header to an already-built JSON response. */
function withCookie(resp: Response, cookie: string): Response {
  const h = new Headers(resp.headers)
  h.append('set-cookie', cookie)
  return new Response(resp.body, { status: resp.status, headers: h })
}

const parseBody = (req: Request) =>
  req.json().catch(() => ({})) as Promise<Record<string, unknown>>

// ---------------------------------------------------------------- auth
/** POST /auth/register {username, password} → set session cookie, {user}. */
export async function handleRegister(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: '会员系统未启用' }, env, 503, req)
  // Rate-limit account creation per IP (same KV pattern as the login throttle) —
  // otherwise one script can mint unlimited free-tier identities in a day.
  const ip = req.headers.get('CF-Connecting-IP') || 'anon'
  if (!(await underQuota(env, 'rg', ip, REGISTER_CAP))) {
    return json({ error: '注册过于频繁,请明天再试' }, env, 429, req)
  }
  const body = await parseBody(req)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!USERNAME_RE.test(username)) {
    return json({ error: '用户名需为 3-20 位字母、数字、下划线或中文' }, env, 400, req)
  }
  if (password.length < 6 || password.length > 72) {
    return json({ error: '密码需为 6-72 位' }, env, 400, req)
  }
  const salt = makeSalt()
  const passHash = await hashPassword(password, salt)
  let id: number
  try {
    const r = await db
      .prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)')
      .bind(username, passHash, salt, Date.now())
      .run()
    id = Number(r.meta.last_row_id)
  } catch (e) {
    if (String(e).includes('UNIQUE')) return json({ error: '用户名已被占用' }, env, 409, req)
    return json({ error: '注册失败，请稍后再试' }, env, 500, req)
  }
  await bump(env, 'rg', ip) // only a SUCCESSFUL registration spends the IP's daily slot
  const resp = json({ user: userShape({ username, member_until: null }) }, env, 200, req)
  return withCookie(resp, await makeSessionCookie(env, id))
}

/** POST /auth/login {username, password} → set session cookie, {user}. */
export async function handleAuthLogin(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: '会员系统未启用' }, env, 503, req)
  // Rate-limit password FAILURES per IP (successful logins are free) — same KV
  // pattern as the AI quotas, so brute force is bounded without a new binding.
  const ip = req.headers.get('CF-Connecting-IP') || 'anon'
  if (!(await underQuota(env, 'lg', ip, LOGIN_FAIL_CAP))) {
    return json({ error: '尝试次数过多，请明天再试' }, env, 429, req)
  }
  const body = await parseBody(req)
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  const row = username
    ? await db
        .prepare('SELECT id, username, pass_hash, salt, member_until FROM users WHERE username = ?')
        .bind(username)
        .first<UserRow & { pass_hash: string; salt: string }>()
    : null
  // Always run a PBKDF2 (against a dummy hash when the user is absent) so the
  // response time doesn't reveal whether a username exists (enumeration oracle).
  const ok = await verifyPassword(
    password,
    row?.salt ?? DUMMY_SALT,
    row?.pass_hash ?? DUMMY_HASH,
  )
  if (!row || !ok) {
    await bump(env, 'lg', ip)
    return json({ error: '用户名或密码错误' }, env, 401, req)
  }
  const resp = json({ user: userShape(row) }, env, 200, req)
  return withCookie(resp, await makeSessionCookie(env, row.id))
}

/** POST /auth/logout → clear the session cookie. */
export async function handleAuthLogout(req: Request, env: Env): Promise<Response> {
  if (!env.DB) return json({ error: '会员系统未启用' }, env, 503, req)
  return withCookie(json({ ok: true }, env, 200, req), clearSessionCookie())
}

/** POST /auth/activate {code} → mark code used, extend membership, {user}. */
export async function handleActivate(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: '会员系统未启用' }, env, 503, req)
  const uid = await readSession(req, env)
  if (uid === null) return json({ error: '需要登录' }, env, 401, req)
  const body = await parseBody(req)
  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return json({ error: '请输入激活码' }, env, 400, req)
  const found = await db
    .prepare('SELECT code, days, used_by FROM codes WHERE code = ?')
    .bind(code)
    .first<{ code: string; days: number; used_by: number | null }>()
  if (!found) return json({ error: '激活码无效' }, env, 404, req)
  if (found.used_by !== null) return json({ error: '激活码已被使用' }, env, 409, req)
  const now = Date.now()
  const add = found.days * 86_400_000
  // Claim + grant in ONE db.batch() transaction (the wallet.ts grantFreezes
  // pattern): the codes UPDATE's `used_by IS NULL` guard loses a concurrent race
  // cleanly, and the users UPDATE only fires when THIS call's claim landed
  // (EXISTS on used_by + this call's used_at) — so the pair commits together or
  // not at all: a code can never be burned without the membership landing.
  // Accumulation stays single-statement — MAX(now, current expiry) + days — so
  // two concurrent redemptions can't lose days via read-modify-write.
  const [claim, granted] = await db.batch<{ username: string; member_until: number }>([
    db
      .prepare('UPDATE codes SET used_by = ?1, used_at = ?2 WHERE code = ?3 AND used_by IS NULL')
      .bind(uid, now, code),
    db
      .prepare(
        'UPDATE users SET member_until = MAX(?1, COALESCE(member_until, 0)) + ?2 ' +
          'WHERE id = ?3 AND EXISTS (SELECT 1 FROM codes WHERE code = ?4 AND used_by = ?3 AND used_at = ?1) ' +
          'RETURNING username, member_until',
      )
      .bind(now, add, uid, code),
  ])
  if (!claim.meta.changes) return json({ error: '激活码已被使用' }, env, 409, req)
  const updated = granted.results?.[0]
  if (!updated) return json({ error: '需要登录' }, env, 401, req)
  return json({ user: userShape(updated) }, env, 200, req)
}

// ---------------------------------------------------------------- progress sync
/** GET /progress → {data: object|null, updatedAt: number|null}. */
export async function handleGetProgress(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: '会员系统未启用' }, env, 503, req)
  const uid = await readSession(req, env)
  if (uid === null) return json({ error: '需要登录' }, env, 401, req)
  const row = await db
    .prepare('SELECT data, updated_at FROM progress WHERE user_id = ?')
    .bind(uid)
    .first<{ data: string; updated_at: number }>()
  if (!row) return json({ data: null, updatedAt: null }, env, 200, req)
  let data: unknown = null
  try {
    data = JSON.parse(row.data)
  } catch {
    /* corrupt row → behave as empty */
  }
  return json({ data, updatedAt: row.updated_at }, env, 200, req)
}

/** PUT /progress {data: object} → upsert, {updatedAt}. */
export async function handlePutProgress(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: '会员系统未启用' }, env, 503, req)
  const uid = await readSession(req, env)
  if (uid === null) return json({ error: '需要登录' }, env, 401, req)
  const body = await parseBody(req)
  if (typeof body.data !== 'object' || body.data === null) {
    return json({ error: '进度格式不正确' }, env, 400, req)
  }
  const serialized = JSON.stringify(body.data)
  if (serialized.length > MAX_PROGRESS_CHARS) return json({ error: '进度数据过大' }, env, 413, req)
  const now = Date.now()
  await db
    .prepare(
      'INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
    )
    .bind(uid, serialized, now)
    .run()
  return json({ updatedAt: now }, env, 200, req)
}
