import { routeAgentRequest } from 'agents'
import { identify, verifyUser } from './auth'
import {
  handleRegister,
  handleAuthLogin,
  handleAuthLogout,
  handleActivate,
  handleGetProgress,
  handlePutProgress,
} from './membership'
import { handleRealtimeToken } from './realtime'
import { handleGrokToken } from './grok'
import { handleCheckout, handleStripeWebhook, payEnabled } from './pay'
// Re-export the voice-agent Durable Object so Wrangler registers the class.
export { VoiceTutor } from './voiceAgent'
import {
  conversationSystem,
  writingSystem,
  tutorSystem,
  coachSystem,
  WRITING_SCHEMA,
  type LessonCtx,
} from './prompts'

export interface Env {
  QUOTA: KVNamespace
  AI: Ai
  CF_AI_MODEL: string
  CF_TTS_MODEL?: string // Workers AI text-to-speech (default Deepgram Aura-2 EN)
  CF_STT_MODEL?: string // Workers AI speech-to-text (default Whisper large v3 turbo)
  ALLOWED_ORIGIN: string
  // Cloudflare Access (Zero Trust) — auth
  CF_ACCESS_TEAM_DOMAIN: string // e.g. myteam.cloudflareaccess.com
  CF_ACCESS_AUD: string // Access application audience (AUD) tag
  APP_PASSCODE?: string // optional shared passcode gate (no dashboard needed)
  DEV_BYPASS_AUTH?: string // "true" only for local `wrangler dev`
  AZURE_SPEECH_KEY: string
  AZURE_SPEECH_REGION: string
  AZURE_VOICE: string
  DAILY_AI_QUOTA: string
  DAILY_SPEECH_QUOTA: string
  // Membership (Cloudflare D1) — OPTIONAL. Absent DB → everything runs as before
  // and the /auth/* + /progress endpoints answer 503.
  DB?: D1Database
  SESSION_SECRET?: string // HMAC key for session cookies (wrangler secret put)
  FREE_AI_QUOTA?: string // daily AI calls for non-members (default 5)
  FREE_SPEECH_QUOTA?: string // daily speech calls for non-members (default 20)
  // OpenAI Realtime (voice conversation) — OPTIONAL. Absent key → /realtime/token
  // answers 503 and /health reports realtime:false; everything else unchanged.
  OPENAI_API_KEY?: string // secret: wrangler secret put OPENAI_API_KEY
  OPENAI_REALTIME_MODEL?: string // default gpt-4o-realtime-preview
  OPENAI_REALTIME_VOICE?: string // default alloy
  DAILY_REALTIME_QUOTA?: string // daily realtime sessions for members (default 20)
  FREE_REALTIME_QUOTA?: string // daily realtime sessions for non-members (default 2)
  // xAI Grok realtime voice (native speech-to-speech) — OPTIONAL secret.
  XAI_API_KEY?: string // secret: wrangler secret put XAI_API_KEY
  XAI_REALTIME_MODEL?: string // default grok-voice-latest
  XAI_REALTIME_VOICE?: string // default eve
  // Cloudflare Agents voice tutor (realtime voice, all on Workers AI, no key).
  VoiceTutor: DurableObjectNamespace
  // Stripe self-serve membership — OPTIONAL. Absent key → /pay/* answers 503 and
  // /health payment:false; the app falls back to activation codes.
  STRIPE_SECRET_KEY?: string // secret: wrangler secret put STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET?: string // secret: wrangler secret put STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_MONTH?: string // Stripe Price ID for the monthly plan
  STRIPE_PRICE_QUARTER?: string // Stripe Price ID for the quarterly plan
  STRIPE_PRICE_YEAR?: string // Stripe Price ID for the yearly plan
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// ---------------------------------------------------------------- helpers
// Cookie-based auth needs credentialed CORS: echo the caller's origin (can't be
// '*' with credentials) when it matches ALLOWED_ORIGIN, and allow credentials.
function cors(env: Env, req?: Request): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*'
  const origin = req?.headers.get('origin') || ''
  const allowOrigin = allowed === '*' ? origin || '*' : allowed
  const h: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-passcode',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  // Credentials ONLY for an explicitly-configured exact origin — never paired
  // with a reflected/wildcard origin (that would let any site read a victim's
  // credentialed responses). Same-origin cookie auth still works without this
  // header: CORS credential rules apply to cross-origin requests only.
  if (allowed !== '*' && allowOrigin === allowed) h['Access-Control-Allow-Credentials'] = 'true'
  return h
}

export function json(data: unknown, env: Env, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors(env, req) },
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// Soft per-user daily quotas via KV (read-only gate + explicit charge-on-success,
// so failed upstream calls don't burn the user's quota). Non-atomic by design —
// a small app tolerates the rare concurrent-burst overshoot; front with a CF
// rate-limit rule if strict enforcement is ever needed.
export async function underQuota(env: Env, prefix: string, uid: string, cap: number): Promise<boolean> {
  const cur = Number((await env.QUOTA.get(`${prefix}:${uid}:${today()}`)) || '0')
  return cur < cap
}
export async function bump(env: Env, prefix: string, uid: string): Promise<void> {
  const key = `${prefix}:${uid}:${today()}`
  const cur = Number((await env.QUOTA.get(key)) || '0')
  await env.QUOTA.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 48 })
}

/** Call Cloudflare Workers AI (open-source model). With jsonSchema, uses the
 *  model's structured-output mode. Returns the raw `response` (string or object). */
async function callAI(
  env: Env,
  opts: { system: string; messages: Msg[]; max_tokens: number; jsonSchema?: unknown },
): Promise<unknown> {
  const model = (env.CF_AI_MODEL || DEFAULT_MODEL) as keyof AiModels
  const system =
    opts.system +
    (opts.jsonSchema
      ? ' Respond with ONLY valid JSON matching the requested schema — no markdown, no code fences, no prose.'
      : '')
  const input: Record<string, unknown> = {
    messages: [{ role: 'system', content: system }, ...opts.messages],
    max_tokens: opts.max_tokens,
  }
  if (opts.jsonSchema) {
    input.response_format = { type: 'json_schema', json_schema: opts.jsonSchema }
  }
  const r = (await env.AI.run(model, input as never)) as { response?: unknown }
  if (r?.response == null || r.response === '') throw new Error('empty response')
  return r.response
}

/** For text features: coerce the AI response to a trimmed string. */
async function callAIText(
  env: Env,
  opts: { system: string; messages: Msg[]; max_tokens: number },
): Promise<string> {
  const r = await callAI(env, opts)
  return String(r).trim()
}

/** Extract a JSON object from a model response (tolerates stray fences/prose). */
function parseJson(raw: string): unknown {
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a >= 0 && b > a) s = s.slice(a, b + 1)
  return JSON.parse(s)
}

export const cap = (s: unknown, n: number): string | undefined =>
  typeof s === 'string' ? s.slice(0, n) : undefined

// Non-members (only possible once D1 membership is on) get a small taste quota.
const FREE_QUOTA_MSG = '免费体验额度已用完，激活会员解锁完整额度'

export function lessonFrom(v: unknown): LessonCtx {
  const o = (v || {}) as Record<string, unknown>
  // Cap every client string that reaches a prompt — bounds cost / DoS amplification.
  return {
    day: typeof o.day === 'number' ? o.day : undefined,
    theme: cap(o.theme, 200),
    title_en: cap(o.title_en, 200),
    grammar: cap(o.grammar, 300),
    level: cap(o.level, 40),
  }
}

function cleanMessages(v: unknown): Msg[] {
  if (!Array.isArray(v)) return []
  const msgs = v
    .filter(
      (m): m is Msg =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0,
    )
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
  // Anthropic requires the first message to be role 'user'.
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift()
  return msgs
}

// ---------------------------------------------------------------- handlers
async function handleAI(path: string, req: Request, env: Env): Promise<Response> {
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401)
  const uid = ident.uid
  const capQuota = ident.member
    ? Number(env.DAILY_AI_QUOTA || '80')
    : Number(env.FREE_AI_QUOTA || '5')
  if (!(await underQuota(env, 'q', uid, capQuota))) {
    return json({ error: ident.member ? '今日 AI 额度已用完，明天再来～' : FREE_QUOTA_MSG }, env, 429)
  }

  const bodyIn = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const lesson = lessonFrom(bodyIn.lesson)

  try {
    if (path === '/ai/chat') {
      const scenario = cap(bodyIn.scenario, 400)
      const messages = cleanMessages(bodyIn.messages)
      // Scenario is client-supplied → deliver it as a user turn, not system authority.
      if (!messages.length) {
        messages.push({
          role: 'user',
          content: scenario
            ? `Let's role-play this scenario to practice: ${scenario}. Please greet me to start.`
            : "Let's practice today's conversation. Please greet me to start.",
        })
      }
      const reply = await callAIText(env, { system: conversationSystem(lesson), messages, max_tokens: 700 })
      await bump(env, 'q', uid)
      return json({ reply }, env)
    }
    if (path === '/ai/writing') {
      const text = String(bodyIn.text || '').slice(0, 4000)
      if (!text.trim()) return json({ error: '没有可批改的内容' }, env, 400)
      const task = cap(bodyIn.prompt, 500) || ''
      const raw = await callAI(env, {
        system: writingSystem(lesson),
        messages: [{ role: 'user', content: `Writing task: ${task}\n\n---\nMy writing:\n${text}` }],
        max_tokens: 1600,
        jsonSchema: WRITING_SCHEMA,
      })
      await bump(env, 'q', uid) // charge on a successful model call, even if parse fails
      try {
        // Structured-output mode may return an object directly, or a JSON string.
        const feedback = typeof raw === 'string' ? parseJson(raw) : raw
        return json({ feedback }, env)
      } catch {
        return json({ error: '批改结果解析失败，请重试' }, env, 502)
      }
    }
    if (path === '/ai/tutor') {
      const question = String(bodyIn.question || '').slice(0, 2000)
      if (!question.trim()) return json({ error: '请输入问题' }, env, 400)
      const history = cleanMessages(bodyIn.history)
      const reply = await callAIText(env, {
        system: tutorSystem(lesson),
        messages: [...history, { role: 'user', content: question }],
        max_tokens: 1200,
      })
      await bump(env, 'q', uid)
      return json({ reply }, env)
    }
    if (path === '/ai/coach') {
      const target = String(bodyIn.target || '').slice(0, 500)
      const assessment = JSON.stringify(bodyIn.assessment ?? {}).slice(0, 2000)
      const reply = await callAIText(env, {
        system: coachSystem(lesson),
        messages: [{ role: 'user', content: `Target: ${target}\nAssessment: ${assessment}` }],
        max_tokens: 600,
      })
      await bump(env, 'q', uid)
      return json({ reply }, env)
    }
  } catch {
    // Don't echo upstream error text to the client.
    return json({ error: 'AI 暂时不可用，请稍后再试' }, env, 502)
  }
  return json({ error: 'not found' }, env, 404)
}

/** Mint a short-lived Azure Speech token so the browser SDK never sees the key. */
async function handleSpeechToken(req: Request, env: Env): Promise<Response> {
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401)
  const uid = ident.uid
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    return json({ error: '语音服务未配置' }, env, 503)
  }
  // One token already grants ~10 min of direct Azure access — cap mints per user/day.
  const spCap = ident.member ? Number(env.DAILY_SPEECH_QUOTA || '60') : Number(env.FREE_SPEECH_QUOTA || '20')
  if (!(await underQuota(env, 'sp', uid, spCap))) {
    return json({ error: ident.member ? '今日语音额度已用完' : FREE_QUOTA_MSG }, env, 429)
  }
  const res = await fetch(
    `https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY } },
  )
  if (!res.ok) return json({ error: '语音令牌获取失败' }, env, 502)
  const token = await res.text()
  await bump(env, 'sp', uid)
  return json({ token, region: env.AZURE_SPEECH_REGION, voice: env.AZURE_VOICE || 'en-US-AvaMultilingualNeural' }, env)
}

const DEFAULT_TTS = '@cf/deepgram/aura-2-en'
const DEFAULT_STT = '@cf/openai/whisper-large-v3-turbo'

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

/** Text-to-speech via Cloudflare Workers AI (Deepgram Aura). Returns audio/mpeg. */
async function handleTts(req: Request, env: Env): Promise<Response> {
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401)
  const uid = ident.uid
  const spCap = ident.member ? Number(env.DAILY_SPEECH_QUOTA || '200') : Number(env.FREE_SPEECH_QUOTA || '20')
  if (!(await underQuota(env, 'sp', uid, spCap))) {
    return json({ error: ident.member ? '今日语音额度已用完' : FREE_QUOTA_MSG }, env, 429)
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const text = String(body.text || '').slice(0, 800)
  if (!text.trim()) return json({ error: '没有可朗读的内容' }, env, 400)
  try {
    const model = (env.CF_TTS_MODEL || DEFAULT_TTS) as keyof AiModels
    const r = (await env.AI.run(model, { text } as never)) as unknown
    await bump(env, 'sp', uid)
    // Aura returns an audio ReadableStream; MeloTTS returns { audio: base64 }.
    let audio: BodyInit | null = null
    if (r instanceof ReadableStream) audio = r
    else if (r instanceof ArrayBuffer) audio = r
    else if (r && typeof r === 'object' && 'audio' in r && typeof (r as { audio: string }).audio === 'string') {
      audio = Uint8Array.from(atob((r as { audio: string }).audio), (c) => c.charCodeAt(0))
    }
    if (!audio) return json({ error: '语音合成失败' }, env, 502)
    return new Response(audio, {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', ...cors(env, req) },
    })
  } catch {
    return json({ error: '语音合成失败' }, env, 502)
  }
}

/** Speech-to-text via Cloudflare Workers AI (Whisper). Body = raw audio bytes. */
async function handleStt(req: Request, env: Env): Promise<Response> {
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401)
  const uid = ident.uid
  const spCap = ident.member ? Number(env.DAILY_SPEECH_QUOTA || '200') : Number(env.FREE_SPEECH_QUOTA || '20')
  if (!(await underQuota(env, 'sp', uid, spCap))) {
    return json({ error: ident.member ? '今日语音额度已用完' : FREE_QUOTA_MSG }, env, 429)
  }
  const buf = await req.arrayBuffer()
  if (!buf.byteLength) return json({ error: '没有音频' }, env, 400)
  if (buf.byteLength > 6_000_000) return json({ error: '音频过大' }, env, 413)
  try {
    const model = (env.CF_STT_MODEL || DEFAULT_STT) as keyof AiModels
    // v3-turbo takes a base64 string; the classic model takes a byte array.
    const input = String(model).includes('turbo')
      ? { audio: b64(buf) }
      : { audio: [...new Uint8Array(buf)] }
    const r = (await env.AI.run(model, input as never)) as { text?: string }
    await bump(env, 'sp', uid)
    return json({ text: (r?.text || '').trim() }, env)
  } catch {
    return json({ error: '识别失败，请重试' }, env, 502)
  }
}

/** Whoami — the frontend polls this to learn if AI is usable / who is signed in.
 *  Open mode (no Access) → returns a "访客" identity so AI works without login. */
async function handleMe(req: Request, env: Env): Promise<Response> {
  // Account mode (D1 bound): username/password login + activation-code membership.
  if (env.DB) {
    const ident = await identify(req, env)
    if (ident?.uid.startsWith('u:')) {
      // Session user — fetch the expiry so the frontend can show it.
      const row = await env.DB
        .prepare('SELECT member_until FROM users WHERE id = ?')
        .bind(Number(ident.uid.slice(2)))
        .first<{ member_until: number | null }>()
      return json(
        // `account:true` marks a REAL D1 session (has cloud progress sync) — a
        // passcode/Access "owner" is a member but not a syncable account.
        { email: ident.name, member: ident.member, memberUntil: row?.member_until ?? null, account: true, mode: 'account' },
        env, 200, req,
      )
    }
    // Passcode / Access / dev-bypass callers are still honored as full members,
    // but they are NOT D1 accounts (no cloud sync) → account:false.
    if (ident?.member) {
      return json({ email: ident.name, member: true, memberUntil: null, account: false, mode: 'account' }, env, 200, req)
    }
    return json({ email: null, mode: 'account' }, env, 401, req)
  }
  const uid = await verifyUser(req, env)
  // mode tells the frontend how to log in: Access redirect, passcode prompt, or open.
  const mode = env.CF_ACCESS_TEAM_DOMAIN ? 'access' : env.APP_PASSCODE ? 'passcode' : 'open'
  if (!uid) return json({ email: null, mode }, env, 401)
  const email = mode === 'access' ? uid : mode === 'passcode' ? 'member' : '访客'
  return json({ email, mode }, env)
}

/** Access-protected redirect target. Reaching it means Access has authenticated
 *  the user (or DEV_BYPASS); bounce back to the app's `redirect` param. */
function handleLogin(req: Request): Response {
  const url = new URL(req.url)
  const back = url.searchParams.get('redirect') || '/'
  return new Response(null, { status: 302, headers: { location: back } })
}

/** Clear the Access session on the team domain, then bounce back to the app. */
function handleLogout(req: Request, env: Env): Response {
  const url = new URL(req.url)
  const back = url.searchParams.get('redirect') || '/'
  const dest = env.CF_ACCESS_TEAM_DOMAIN
    ? `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(back)}`
    : back
  return new Response(null, { status: 302, headers: { location: dest } })
}

// Apply credentialed CORS to every response (origin-echoed, not '*').
function withCors(resp: Response, env: Env, req: Request): Response {
  const h = new Headers(resp.headers)
  for (const [k, v] of Object.entries(cors(env, req))) h.set(k, v)
  return new Response(resp.body, { status: resp.status, headers: h })
}

// ---------------------------------------------------------------- entry
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Cloudflare Agents voice tutor — WebSocket routing (/agents/voice-tutor/*).
    // Handle before the JSON API router; WS upgrades bypass the CORS wrapper.
    const agentResp = await routeAgentRequest(req, env)
    if (agentResp) return agentResp

    if (req.method === 'OPTIONS') return withCors(new Response(null), env, req)
    const { pathname } = new URL(req.url)

    const route = async (): Promise<Response> => {
      if (pathname === '/health') {
        return json(
          {
            ok: true,
            features: {
              ai: true, // Workers AI binding is always present
              speech: !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION), // Azure premium
              cfVoice: true, // Workers AI TTS (Aura) + STT (Whisper), always on
              realtime: !!env.OPENAI_API_KEY, // OpenAI Realtime voice conversation
              grokRealtime: !!env.XAI_API_KEY, // xAI Grok native realtime voice
              voiceAgent: true, // Cloudflare Agents voice tutor (Workers AI, free)
              loginRequired: !!env.CF_ACCESS_TEAM_DOMAIN,
              membership: !!env.DB, // D1 accounts + activation codes + progress sync
              payment: payEnabled(env), // Stripe self-serve checkout
            },
          },
          env,
        )
      }
      if (pathname === '/me' && req.method === 'GET') return handleMe(req, env)
      if (pathname === '/login') return handleLogin(req)
      if (pathname === '/logout') return handleLogout(req, env)
      // Membership (D1) — all answer 503 会员系统未启用 until DB is bound.
      if (pathname === '/auth/register' && req.method === 'POST') return handleRegister(req, env)
      if (pathname === '/auth/login' && req.method === 'POST') return handleAuthLogin(req, env)
      if (pathname === '/auth/logout' && req.method === 'POST') return handleAuthLogout(req, env)
      if (pathname === '/auth/activate' && req.method === 'POST') return handleActivate(req, env)
      if (pathname === '/progress' && req.method === 'GET') return handleGetProgress(req, env)
      if (pathname === '/progress' && req.method === 'PUT') return handlePutProgress(req, env)
      if (pathname === '/speech/token' && req.method === 'GET') return handleSpeechToken(req, env)
      if (pathname === '/speech/tts' && req.method === 'POST') return handleTts(req, env)
      if (pathname === '/speech/stt' && req.method === 'POST') return handleStt(req, env)
      if (pathname === '/realtime/token' && req.method === 'POST') return handleRealtimeToken(req, env)
      if (pathname === '/grok/token' && req.method === 'POST') return handleGrokToken(req, env)
      if (pathname === '/pay/checkout' && req.method === 'POST') return handleCheckout(req, env)
      if (pathname === '/pay/webhook' && req.method === 'POST') return handleStripeWebhook(req, env)
      if (pathname.startsWith('/ai/') && req.method === 'POST') return handleAI(pathname, req, env)
      return json({ error: 'not found' }, env, 404)
    }

    return withCors(await route(), env, req)
  },
}
