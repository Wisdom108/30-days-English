import type { Env } from './index'

// Account sessions + password hashing for the D1 membership system. Everything
// runs on WebCrypto (crypto.subtle) — no extra dependencies.
//
// Session cookie: `sid=v1.{uid}.{exp}.{sig}` where sig = HMAC-SHA256 over the
// `v1.{uid}.{exp}` payload keyed by SESSION_SECRET (base64url). Stateless — no
// session table; revocation = rotate SESSION_SECRET.

const COOKIE = 'sid'
const MAX_AGE = 180 * 24 * 60 * 60 // 180 days, seconds
const PBKDF2_ITERATIONS = 20_000 // CPU-friendly for the Workers free tier

const enc = new TextEncoder()

// ---------------------------------------------------------------- encoding
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function hex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

// ---------------------------------------------------------------- session cookie
async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

/** Build the Set-Cookie header value for a signed-in user. */
export async function makeSessionCookie(env: Env, uid: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const payload = `v1.${uid}.${exp}`
  const key = await hmacKey(env.SESSION_SECRET || '', 'sign')
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  // Same-origin app (Worker serves the frontend) → SameSite=Lax is enough.
  return `${COOKIE}=${payload}.${sig}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

/** Verify the session cookie → user id, or null (missing/forged/expired). */
export async function readSession(req: Request, env: Env): Promise<number | null> {
  if (!env.SESSION_SECRET) return null
  const raw = (req.headers.get('cookie') || '').match(/(?:^|;\s*)sid=([^;\s]+)/)?.[1]
  const m = raw?.match(/^(v1\.(\d+)\.(\d+))\.([A-Za-z0-9_-]+)$/)
  if (!m) return null
  const [, payload, uid, exp, sigStr] = m
  const sig = fromB64url(sigStr)
  if (!sig || sig.length !== 32) return null
  const key = await hmacKey(env.SESSION_SECRET, 'verify')
  // crypto.subtle.verify compares the MAC bytes in constant time.
  const ok = await crypto.subtle.verify('HMAC', key, sig, enc.encode(payload))
  if (!ok) return null
  if (Number(exp) * 1000 < Date.now()) return null
  return Number(uid)
}

/** Set-Cookie header value that signs the user out. */
export function clearSessionCookie(): string {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
}

// ---------------------------------------------------------------- passwords
/** Fresh random salt (16 bytes, hex) for a new account. */
export function makeSalt(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return hex(b)
}

/** PBKDF2-SHA256 (20000 iterations) → 32-byte key, hex encoded. */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return hex(bits)
}

/** Recompute the hash and compare byte-by-byte in constant time. */
export async function verifyPassword(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  const got = fromHex(await hashPassword(password, saltHex))
  const want = fromHex(hashHex)
  if (got.length !== want.length || want.length === 0) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]
  return diff === 0
}
