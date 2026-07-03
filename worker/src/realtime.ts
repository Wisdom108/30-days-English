import { identify } from './auth'
import { json, underQuota, bump, lessonFrom, type Env } from './index'

// OpenAI Realtime voice-conversation backend.
//
// The browser opens a WebRTC session DIRECTLY to OpenAI, so it needs an OpenAI
// credential — but we never ship the real OPENAI_API_KEY to the client. Instead
// this endpoint mints a short-lived EPHEMERAL client token (valid ~1 min, single
// session) server-side; the browser uses that to establish the WebRTC PeerConnection.
//
// Degrades gracefully: if OPENAI_API_KEY is unset the endpoint answers 503 and
// /health reports realtime:false — the rest of the Worker is unaffected.
//
// Classic session-mint flow (as documented by OpenAI):
//   POST https://api.openai.com/v1/realtime/sessions
//     headers: { Authorization: `Bearer <OPENAI_API_KEY>`, 'Content-Type': 'application/json' }
//     body:    { model, voice, instructions }
//   → 200 JSON with the ephemeral key at:  data.client_secret.value
//                          (expiry unix ts) data.client_secret.expires_at
// If OpenAI changes the shape, adjust the two field paths marked below.

/** POST /realtime/token → mint a short-lived OpenAI Realtime ephemeral client token. */
export async function handleRealtimeToken(req: Request, env: Env): Promise<Response> {
  // Gate: feature is off unless the real key is configured.
  if (!env.OPENAI_API_KEY) return json({ error: '实时语音未启用' }, env, 503, req)

  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401, req)

  // Realtime is EXPENSIVE (usage-billed by OpenAI): members get the full cap,
  // non-members a tiny taste. Same KV quota pattern as the other features (prefix 'rt').
  const cap = ident.member
    ? Number(env.DAILY_REALTIME_QUOTA || '20')
    : Number(env.FREE_REALTIME_QUOTA || '2')
  if (!(await underQuota(env, 'rt', ident.uid, cap))) {
    return json(
      { error: ident.member ? '今日实时对话额度已用完' : '免费体验额度已用完，开通会员解锁' },
      env,
      429,
      req,
    )
  }

  // Same lesson-capping approach as handleAI — every client string is bounded.
  const { lesson } = (await req.json().catch(() => ({}))) as { lesson?: unknown }
  const l = lessonFrom(lesson)
  const title = l.title_en || 'everyday English'
  const theme = l.theme || 'general conversation'
  const instructions =
    `You are a warm, encouraging English conversation tutor for a Chinese learner at CEFR A2-B1. ` +
    `Today's lesson: ${title} (theme: ${theme}). ` +
    `Speak ONLY in simple, clear English at a natural but slightly slow pace. ` +
    `Keep replies to 1-3 short sentences. ` +
    `Gently correct major mistakes by restating correctly, then continue the conversation with a follow-up question. ` +
    `Be patient and positive.`

  const model = env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview'

  try {
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice: env.OPENAI_REALTIME_VOICE || 'alloy',
        instructions,
      }),
    })
    // Don't echo upstream error text to the client (may leak account details).
    if (!res.ok) return json({ error: '实时语音初始化失败' }, env, 502, req)
    const data = (await res.json()) as {
      client_secret?: { value?: string; expires_at?: number }
    }
    // Ephemeral key lives at data.client_secret.value (adjust here if OpenAI changes it).
    const token = data.client_secret?.value
    if (!token) return json({ error: '实时语音初始化失败' }, env, 502, req)
    await bump(env, 'rt', ident.uid)
    return json(
      { token, model, expiresAt: data.client_secret?.expires_at ?? null },
      env,
      200,
      req,
    )
  } catch {
    return json({ error: '实时语音初始化失败' }, env, 502, req)
  }
}
