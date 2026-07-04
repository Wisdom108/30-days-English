import { config, features } from '../config'

// Runtime server capabilities (from /health). Lets the voice layer know what the
// Worker ACTUALLY has configured — e.g. Azure is only available if its key is set
// server-side, which the frontend can't know at build time. Defaults assume no
// Azure (speech:false) and Cloudflare voice on when a Worker exists, so speak()
// goes straight to the free Aura-2 path without a wasted Azure round-trip.
export interface ServerCaps {
  ai: boolean
  speech: boolean // Azure neural TTS + phoneme assessment
  cfVoice: boolean // Cloudflare Aura-2 TTS + Whisper STT
  realtime: boolean // OpenAI Realtime voice conversation (needs server-side OpenAI key)
  grokRealtime: boolean // xAI Grok native realtime voice (needs server-side xAI key)
  voiceAgent: boolean // Cloudflare Agents realtime voice tutor (Workers AI, free, no key)
  payment: boolean // Stripe self-serve checkout (needs server-side Stripe key)
  wallet: boolean // earned-seconds economy: D1 wallet + badges (needs DB + session secret)
  push: boolean // Web Push morning tickles (needs VAPID keys + DB server-side)
}

let caps: ServerCaps = {
  ai: features.worker,
  speech: false,
  cfVoice: features.worker,
  realtime: false,
  grokRealtime: false,
  voiceAgent: features.worker,
  payment: false,
  wallet: false,
  push: false,
}

export function serverCaps(): ServerCaps {
  return caps
}

/** True when the Worker has the earned-seconds wallet (D1 + sessions) configured. */
export function walletAvailable(): boolean {
  return caps.wallet
}

/** True when the Worker has Stripe self-serve checkout configured. */
export function paymentAvailable(): boolean {
  return caps.payment
}

/** True when the Worker can send Web Push morning tickles (VAPID keys + D1). */
export function pushAvailable(): boolean {
  return caps.push
}

/** True when the Worker has the OpenAI Realtime voice path configured. */
export function realtimeAvailable(): boolean {
  return caps.realtime
}

/** True when the Cloudflare Agents voice tutor is available (free, always on with a Worker). */
export function voiceAgentAvailable(): boolean {
  return caps.voiceAgent
}

/** True when the Worker has the xAI Grok native realtime voice configured. */
export function grokRealtimeAvailable(): boolean {
  return caps.grokRealtime
}

/** Fetch /health once and cache the real capabilities. Safe to call repeatedly. */
export async function loadCaps(): Promise<ServerCaps> {
  if (!features.worker) return caps
  try {
    const r = await fetch(`${config.workerUrl}/health`)
    if (r.ok) {
      const d = (await r.json()) as { features?: Partial<ServerCaps> }
      caps = {
        ai: !!d.features?.ai,
        speech: !!d.features?.speech,
        cfVoice: !!d.features?.cfVoice,
        realtime: !!d.features?.realtime,
        grokRealtime: !!d.features?.grokRealtime,
        voiceAgent: d.features?.voiceAgent ?? features.worker,
        payment: !!d.features?.payment,
        wallet: !!d.features?.wallet,
        push: !!d.features?.push,
      }
    }
  } catch {
    /* keep defaults */
  }
  return caps
}
