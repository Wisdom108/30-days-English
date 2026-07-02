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
  ANTHROPIC_API_KEY: string
  ANTHROPIC_MODEL: string
  ALLOWED_ORIGIN: string
  SUPABASE_URL: string
  SUPABASE_JWT_SECRET?: string
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

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// ---------------------------------------------------------------- helpers
function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors(env) },
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

/** Call Claude (raw Messages API). Returns the first text block, or throws. */
async function callClaude(
  env: Env,
  opts: { system: string; messages: Msg[]; max_tokens: number; jsonSchema?: unknown },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: env.ANTHROPIC_MODEL || 'claude-opus-4-8',
    max_tokens: opts.max_tokens,
    system: opts.system,
    messages: opts.messages,
  }
  if (opts.jsonSchema) {
    body.output_config = { format: { type: 'json_schema', schema: opts.jsonSchema } }
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    stop_reason?: string
    content?: { type: string; text?: string }[]
  }
  if (data.stop_reason === 'refusal') {
    return '抱歉，这个请求我没法处理。换个说法再试试？'
  }
  const text = (data.content || []).find((b) => b.type === 'text')?.text
  if (!text) throw new Error('empty response')
  return text
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
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI 未配置' }, env, 503)
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
      const reply = await callClaude(env, { system: conversationSystem(lesson), messages, max_tokens: 700 })
      await bump(env, 'q', uid)
      return json({ reply }, env)
    }
    if (path === '/ai/writing') {
      const text = String(bodyIn.text || '').slice(0, 4000)
      if (!text.trim()) return json({ error: '没有可批改的内容' }, env, 400)
      const task = cap(bodyIn.prompt, 500) || ''
      const raw = await callClaude(env, {
        system: writingSystem(lesson),
        messages: [{ role: 'user', content: `Writing task: ${task}\n\n---\nMy writing:\n${text}` }],
        max_tokens: 1600,
        jsonSchema: WRITING_SCHEMA,
      })
      await bump(env, 'q', uid) // charge on a successful model call, even if parse fails
      try {
        return json({ feedback: JSON.parse(raw) }, env)
      } catch {
        return json({ error: '批改结果解析失败，请重试' }, env, 502)
      }
    }
    if (path === '/ai/tutor') {
      const question = String(bodyIn.question || '').slice(0, 2000)
      if (!question.trim()) return json({ error: '请输入问题' }, env, 400)
      const history = cleanMessages(bodyIn.history)
      const reply = await callClaude(env, {
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
      const reply = await callClaude(env, {
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

// ---------------------------------------------------------------- entry
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env) })
    const { pathname } = new URL(req.url)

    if (pathname === '/health') {
      return json(
        {
          ok: true,
          features: {
            ai: !!env.ANTHROPIC_API_KEY,
            speech: !!(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION),
            auth: !!(env.SUPABASE_URL || env.SUPABASE_JWT_SECRET),
          },
        },
        env,
      )
    }
    if (pathname === '/speech/token' && req.method === 'GET') return handleSpeechToken(req, env)
    if (pathname.startsWith('/ai/') && req.method === 'POST') return handleAI(pathname, req, env)

    return json({ error: 'not found' }, env, 404)
  },
}
