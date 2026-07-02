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
}

let caps: ServerCaps = { ai: features.worker, speech: false, cfVoice: features.worker }

export function serverCaps(): ServerCaps {
  return caps
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
      }
    }
  } catch {
    /* keep defaults */
  }
  return caps
}
