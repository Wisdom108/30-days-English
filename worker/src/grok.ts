import { identify } from './auth'
import { json, underQuota, bump, lessonFrom, type Env } from './index'

// xAI Grok realtime VOICE (native speech-to-speech). The browser opens a
// WebSocket straight to wss://api.x.ai/v1/realtime with a short-lived EPHEMERAL
// token (passed as a WS subprotocol) — the real XAI_API_KEY never leaves the
// Worker. This mints that ephemeral token.
//
// Gated on XAI_API_KEY: without it, /grok/token → 503 and /health grokRealtime
// is false. Grok Voice is usage-billed by xAI.

const GROK_MODEL = 'grok-voice-latest'

function tutorInstructions(lesson: ReturnType<typeof lessonFrom>): string {
  const topic = lesson.title_en || lesson.theme || "today's topic"
  return (
    'You are a warm, encouraging English conversation tutor for a Chinese learner at CEFR A2-B1. ' +
    `Today's topic: ${topic}. ` +
    'Speak ONLY in simple, clear English at a natural but slightly slow pace. Keep every reply to 1-2 short sentences. ' +
    'Gently correct a major mistake by restating it correctly, then ask a short follow-up question. Be patient and positive; never switch to Chinese.'
  )
}

/** POST /grok/token → { token, model, voice } (ephemeral secret for the browser WS). */
export async function handleGrokToken(req: Request, env: Env): Promise<Response> {
  if (!env.XAI_API_KEY) return json({ error: '实时语音(Grok)未启用' }, env, 503, req)
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401, req)

  // Realtime is expensive — cap per user/day (reuse the KV quota pattern).
  const cap = ident.member ? Number(env.DAILY_REALTIME_QUOTA || '20') : Number(env.FREE_REALTIME_QUOTA || '2')
  if (!(await underQuota(env, 'rt', ident.uid, cap))) {
    return json({ error: ident.member ? '今日实时对话额度已用完' : '免费体验额度已用完，开通会员解锁' }, env, 429, req)
  }

  const body = (await req.json().catch(() => ({}))) as { lesson?: unknown }
  const lesson = lessonFrom(body.lesson)
  const model = env.XAI_REALTIME_MODEL || GROK_MODEL
  const voice = env.XAI_REALTIME_VOICE || 'eve'

  try {
    // Mint an ephemeral client secret (OpenAI-Realtime-compatible shape).
    // NOTE: if xAI changes the mint endpoint/body, adjust here — the client only
    // needs the returned token string.
    const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions: tutorInstructions(lesson),
          voice,
          turn_detection: { type: 'server_vad' },
        },
      }),
    })
    if (!res.ok) return json({ error: '实时语音初始化失败' }, env, 502, req)
    const data = (await res.json().catch(() => ({}))) as {
      value?: string
      client_secret?: { value?: string }
      secret?: string
    }
    // Be tolerant of the exact response shape.
    const token = data.value || data.client_secret?.value || data.secret
    if (!token) return json({ error: '实时语音初始化失败' }, env, 502, req)
    await bump(env, 'rt', ident.uid)
    return json({ token, model, voice }, env, 200, req)
  } catch {
    return json({ error: '实时语音初始化失败' }, env, 502, req)
  }
}
