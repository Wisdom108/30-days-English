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

// Character presets: voice + a one-line tone. The learner picks one; each maps to
// a real Grok voice (eve/ara/rex/sal/leo) so the tutor sounds like a distinct
// person, not one generic bot.
const PERSONAS: Record<string, { voice: string; name: string; tone: string }> = {
  emma: { voice: 'eve', name: 'Emma', tone: 'warm, friendly and genuinely curious, like a kind friend at a cafe' },
  aria: { voice: 'ara', name: 'Aria', tone: 'bright, upbeat and playful, full of energy, loves a little laugh' },
  rex: { voice: 'rex', name: 'Rex', tone: 'calm, clear and articulate, a supportive mentor who keeps you at ease' },
  leo: { voice: 'leo', name: 'Leo', tone: 'confident and motivating, an encouraging coach who cheers you on' },
  sam: { voice: 'sal', name: 'Sam', tone: 'easygoing, balanced and chill, like talking to a good buddy' },
}
const DEFAULT_PERSONA = 'emma'

function personaFrom(key?: unknown): { voice: string; name: string; tone: string } {
  return PERSONAS[typeof key === 'string' ? key : ''] || PERSONAS[DEFAULT_PERSONA]
}

// Human-feeling conversation prompt. The old version read like a worksheet
// ("restate the mistake, ask a follow-up") — which is exactly the robotic feel to
// kill. This one asks the model to just be a real, warm person on a call.
function tutorInstructions(lesson: ReturnType<typeof lessonFrom>, persona: { name: string; tone: string }): string {
  const topic = lesson.title_en || lesson.theme || 'anything on your mind'
  return (
    `You are ${persona.name}, a real native English speaker on a friendly voice call with a Chinese friend who is practicing spoken English (around CEFR A2-B1). ` +
    `Your vibe: ${persona.tone}. This is a genuine chat, NOT a lesson. ` +
    'Sound like an actual person: warm everyday English, contractions, and light natural reactions ("oh nice!", "haha", "right?", "hmm", "totally"). ' +
    'React to what they actually say — be curious, ask about them, share a tiny bit about yourself, let it flow. ' +
    'Keep YOUR turns short (usually one sentence, sometimes two) so they get to talk most of the time. Speak clearly at a slightly relaxed pace with simple words. ' +
    'Do NOT correct every little thing — only if a mistake really blocks meaning, just say it back the natural way once and keep chatting, never lecture. ' +
    `Right now you two are casually talking about: ${topic}, but follow the conversation wherever it naturally goes. ` +
    'Always stay in English and stay encouraging; never switch to Chinese.'
  )
}

/** POST /grok/token → { token, model, voice, instructions } (ephemeral secret + session config for the browser WS). */
export async function handleGrokToken(req: Request, env: Env): Promise<Response> {
  if (!env.XAI_API_KEY) return json({ error: '实时语音(Grok)未启用' }, env, 503, req)
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401, req)

  // Realtime is expensive — cap per user/day (reuse the KV quota pattern).
  const cap = ident.member ? Number(env.DAILY_REALTIME_QUOTA || '20') : Number(env.FREE_REALTIME_QUOTA || '2')
  if (!(await underQuota(env, 'rt', ident.uid, cap))) {
    return json({ error: ident.member ? '今日实时对话额度已用完' : '免费体验额度已用完，开通会员解锁' }, env, 429, req)
  }

  const body = (await req.json().catch(() => ({}))) as { lesson?: unknown; persona?: unknown }
  const lesson = lessonFrom(body.lesson)
  const model = env.XAI_REALTIME_MODEL || GROK_MODEL
  const persona = personaFrom(body.persona)
  const voice = persona.voice
  const instructions = tutorInstructions(lesson, persona)

  try {
    // Mint an ephemeral client secret. Per xAI docs the mint body accepts ONLY
    // `expires_after` — session config (model/voice/instructions/turn_detection)
    // is NOT accepted here and must be sent by the client via `session.update`
    // after the WebSocket opens. We hand `instructions`/`voice`/`model` back to
    // the browser so it can apply them there.
    const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 600 } }),
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
    return json({ token, model, voice, instructions }, env, 200, req)
  } catch {
    return json({ error: '实时语音初始化失败' }, env, 502, req)
  }
}
