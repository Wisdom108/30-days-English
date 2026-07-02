import { verifyUser } from './auth'
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (allowOrigin !== '*') h['Access-Control-Allow-Credentials'] = 'true'
  return h
}

function json(data: unknown, env: Env, status = 200, req?: Request): Response {
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
async function underQuota(env: Env, prefix: string, uid: string, cap: number): Promise<boolean> {
  const cur = Number((await env.QUOTA.get(`${prefix}:${uid}:${today()}`)) || '0')
  return cur < cap
}
async function bump(env: Env, prefix: string, uid: string): Promise<void> {
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

const cap = (s: unknown, n: number): string | undefined =>
  typeof s === 'string' ? s.slice(0, n) : undefined

function lessonFrom(v: unknown): LessonCtx {
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
  const uid = await verifyUser(req, env)
  if (!uid) return json({ error: '需要登录' }, env, 401)
  const capQuota = Number(env.DAILY_AI_QUOTA || '80')
  if (!(await underQuota(env, 'q', uid, capQuota))) {
    return json({ error: '今日 AI 额度已用完，明天再来～' }, env, 429)
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
  const uid = await verifyUser(req, env)
  if (!uid) return json({ error: '需要登录' }, env, 401)
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    return json({ error: '语音服务未配置' }, env, 503)
  }
  // One token already grants ~10 min of direct Azure access — cap mints per user/day.
  const spCap = Number(env.DAILY_SPEECH_QUOTA || '60')
  if (!(await underQuota(env, 'sp', uid, spCap))) {
    return json({ error: '今日语音额度已用完' }, env, 429)
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

/** Whoami — the frontend polls this to learn if AI is usable / who is signed in.
 *  Open mode (no Access) → returns a "访客" identity so AI works without login. */
async function handleMe(req: Request, env: Env): Promise<Response> {
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
    if (req.method === 'OPTIONS') return withCors(new Response(null), env, req)
    const { pathname } = new URL(req.url)

    const route = async (): Promise<Response> => {
      if (pathname === '/health') {
        return json(
          {
            ok: true,
            features: {
              ai: true, // Workers AI binding is always present
              speech: !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION),
              loginRequired: !!env.CF_ACCESS_TEAM_DOMAIN,
            },
          },
          env,
        )
      }
      if (pathname === '/me' && req.method === 'GET') return handleMe(req, env)
      if (pathname === '/login') return handleLogin(req)
      if (pathname === '/logout') return handleLogout(req, env)
      if (pathname === '/speech/token' && req.method === 'GET') return handleSpeechToken(req, env)
      if (pathname.startsWith('/ai/') && req.method === 'POST') return handleAI(pathname, req, env)
      return json({ error: 'not found' }, env, 404)
    }

    return withCors(await route(), env, req)
  },
}
