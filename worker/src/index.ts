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

/** Soft per-user daily quota via KV. Returns true if the call is allowed. */
async function checkQuota(env: Env, uid: string): Promise<boolean> {
  const cap = Number(env.DAILY_AI_QUOTA || '80')
  const key = `q:${uid}:${today()}`
  const cur = Number((await env.QUOTA.get(key)) || '0')
  if (cur >= cap) return false
  // 2-day TTL so yesterday's counters expire on their own.
  await env.QUOTA.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 48 })
  return true
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

function lessonFrom(v: unknown): LessonCtx {
  const o = (v || {}) as Record<string, unknown>
  return {
    day: typeof o.day === 'number' ? o.day : undefined,
    theme: typeof o.theme === 'string' ? o.theme : undefined,
    title_en: typeof o.title_en === 'string' ? o.title_en : undefined,
    grammar: typeof o.grammar === 'string' ? o.grammar : undefined,
    level: typeof o.level === 'string' ? o.level : undefined,
  }
}

function cleanMessages(v: unknown): Msg[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (m): m is Msg =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 0,
    )
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

// ---------------------------------------------------------------- handlers
async function handleAI(path: string, req: Request, env: Env): Promise<Response> {
  const uid = await verifyUser(req, env)
  if (!uid) return json({ error: '需要登录' }, env, 401)
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI 未配置' }, env, 503)
  if (!(await checkQuota(env, uid))) return json({ error: '今日 AI 额度已用完，明天再来～' }, env, 429)

  const bodyIn = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const lesson = lessonFrom(bodyIn.lesson)

  try {
    if (path === '/ai/chat') {
      const system = conversationSystem(lesson, typeof bodyIn.scenario === 'string' ? bodyIn.scenario : undefined)
      const messages = cleanMessages(bodyIn.messages)
      if (!messages.length) messages.push({ role: 'user', content: "Let's start." })
      const reply = await callClaude(env, { system, messages, max_tokens: 700 })
      return json({ reply }, env)
    }
    if (path === '/ai/writing') {
      const text = String(bodyIn.text || '').slice(0, 4000)
      if (!text.trim()) return json({ error: '没有可批改的内容' }, env, 400)
      const system = writingSystem(lesson, typeof bodyIn.prompt === 'string' ? bodyIn.prompt : undefined)
      const raw = await callClaude(env, {
        system,
        messages: [{ role: 'user', content: text }],
        max_tokens: 1600,
        jsonSchema: WRITING_SCHEMA,
      })
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return json({ error: '批改结果解析失败', raw }, env, 502)
      }
      return json({ feedback: parsed }, env)
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
      return json({ reply }, env)
    }
  } catch (e) {
    return json({ error: 'AI 暂时不可用', detail: String(e).slice(0, 200) }, env, 502)
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
  const res = await fetch(
    `https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY } },
  )
  if (!res.ok) return json({ error: '语音令牌获取失败' }, env, 502)
  const token = await res.text()
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
