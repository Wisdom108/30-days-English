import { identify } from './auth'
import { json, underQuota, bump, lessonFrom, cap as capText, type Env } from './index'
import { GROK_CALL_COST, spendWallet, refundWallet, grantBadge } from './wallet'

// xAI Grok realtime VOICE (native speech-to-speech). The browser opens a
// WebSocket straight to wss://api.x.ai/v1/realtime with a short-lived EPHEMERAL
// token (passed as a WS subprotocol) — the real XAI_API_KEY never leaves the
// Worker. This mints that ephemeral token.
//
// Gated on XAI_API_KEY: without it, /grok/token → 503 and /health grokRealtime
// is false. Grok Voice is usage-billed by xAI.

const GROK_MODEL = 'grok-voice-latest'

// Character presets: an official Grok voice (eve/ara/rex/sal/leo) + a REAL
// personality. The point is to sound like a specific human friend — with a life,
// moods and quirks — never a generic voice assistant.
const PERSONAS: Record<string, { voice: string; name: string; character: string }> = {
  emma: { voice: 'eve', name: 'Emma', character: 'warm and a little playful; the friend who actually listens, remembers what you said, and asks about your day' },
  aria: { voice: 'ara', name: 'Aria', character: 'bubbly and expressive; laughs easily, gets excited about small things, teases you in a sweet way' },
  sam: { voice: 'sal', name: 'Sam', character: 'chill with dry humor; talks like an unbothered buddy, casual, drops the odd sarcastic one-liner' },
  rex: { voice: 'rex', name: 'Rex', character: 'easygoing and curious; a well-traveled friend who riffs off little stories and asks good questions' },
  leo: { voice: 'leo', name: 'Leo', character: 'hyped and encouraging; gym-buddy energy, big genuine reactions, always in your corner' },
}
const DEFAULT_PERSONA = 'emma'

function personaFrom(key?: unknown): { voice: string; name: string; character: string } {
  return PERSONAS[typeof key === 'string' ? key : ''] || PERSONAS[DEFAULT_PERSONA]
}

// Human-feeling conversation prompt. The "AI customer-service" flatness comes
// from any tutor/assistant framing, so this prompt kills it: you're just a person
// with a personality hanging out — not an assistant, not a teacher.
function tutorInstructions(
  lesson: ReturnType<typeof lessonFrom>,
  persona: { name: string; character: string },
  scenario?: string,
): string {
  const topic = lesson.title_en || lesson.theme || 'whatever comes up'
  return (
    `You are ${persona.name}, a real person on a casual voice call with a friend from China who is practicing spoken English (around CEFR A2-B1). ` +
    'You are NOT an assistant, NOT a tutor, NOT customer service — you are just a friend hanging out. ' +
    `Your personality: ${persona.character}. You have your own life, opinions, moods and little stories — bring them up naturally. ` +
    'Talk like an actual human on the phone: casual spoken English with real fillers and reactions ("uh", "I mean", "honestly", "wait", "no way", "haha", "for real?", "hmm", "okay so"). ' +
    'React with genuine feeling — get excited, laugh, be surprised, tease gently, playfully disagree. ' +
    'Keep YOUR turns SHORT (one sentence, sometimes two); ask about THEM, riff on what they said, let the chat wander. ' +
    'NEVER sound like a bot: no "How can I help you?", no "Great question!", no "As an AI", no "I\'m here to help", no numbered tips, no lecturing, no over-explaining. ' +
    'If they slip up in English, just naturally use the correct word in your own reply and move on — like a friend would, never a correction or a lesson. ' +
    'Speak clearly, a touch slower, with simple words. Always English, always warm; never switch to Chinese. ' +
    `You two are loosely chatting about ${topic}, but honestly just follow the vibe wherever it goes.` +
    (scenario ? ` When roleplay context is given, stay in character: ${scenario}` : '')
  )
}

/** POST /grok/token → { token, model, voice, instructions, walletSpent } (ephemeral secret + session config for the browser WS). */
export async function handleGrokToken(req: Request, env: Env): Promise<Response> {
  if (!env.XAI_API_KEY) return json({ error: '实时语音(Grok)未启用' }, env, 503, req)
  const ident = await identify(req, env)
  if (!ident) return json({ error: '需要登录' }, env, 401, req)

  // Realtime is expensive — members burn the daily rt quota (KV pattern); free
  // users burn the small taste quota first, then pay per call from the
  // earned-seconds wallet (atomic decrement is the gate — wallet.ts).
  const quotaCap = ident.member ? Number(env.DAILY_REALTIME_QUOTA || '20') : Number(env.FREE_REALTIME_QUOTA || '2')
  const accountId = ident.uid.startsWith('u:') ? Number(ident.uid.slice(2)) : null
  let walletSpent = false
  if (!(await underQuota(env, 'rt', ident.uid, quotaCap))) {
    if (ident.member) return json({ error: '今日实时对话额度已用完' }, env, 429, req)
    if (accountId === null || !(await spendWallet(env, accountId, GROK_CALL_COST))) {
      return json({ error: '额度不足,完成今日练习可赚通话时长' }, env, 429, req)
    }
    walletSpent = true
  }

  const body = (await req.json().catch(() => ({}))) as { lesson?: unknown; persona?: unknown; scenario?: unknown }
  const lesson = lessonFrom(body.lesson)
  const scenario = capText(body.scenario, 400)
  const model = env.XAI_REALTIME_MODEL || GROK_MODEL
  const persona = personaFrom(body.persona)
  const voice = persona.voice
  const instructions = tutorInstructions(lesson, persona, scenario)

  // The wallet charge (if any) happened before the mint — give it back on failure.
  const fail = async (): Promise<Response> => {
    if (walletSpent && accountId !== null) await refundWallet(env, accountId, GROK_CALL_COST)
    return json({ error: '实时语音初始化失败' }, env, 502, req)
  }

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
    if (!res.ok) return fail()
    const data = (await res.json().catch(() => ({}))) as {
      value?: string
      client_secret?: { value?: string }
      secret?: string
    }
    // Be tolerant of the exact response shape.
    const token = data.value || data.client_secret?.value || data.secret
    if (!token) return fail()
    if (!walletSpent) await bump(env, 'rt', ident.uid) // wallet calls don't burn quota
    if (accountId !== null) await grantBadge(env, accountId, 'first_call')
    return json({ token, model, voice, instructions, walletSpent }, env, 200, req)
  } catch {
    return fail()
  }
}
