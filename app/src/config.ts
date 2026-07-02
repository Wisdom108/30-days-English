// Runtime configuration + feature flags.
//
// The app DEGRADES GRACEFULLY: with no env vars it runs as a pure-static offline
// PWA (browser Web Speech, no AI, no login). Configure the Worker URL and the
// premium features (AI + neural voice, gated by Cloudflare Access login) light up.
//
// Fill these in .env.local (see .env.example):
//   VITE_WORKER_URL   Cloudflare Worker base URL (AI proxy + Azure token + auth)
//                     e.g. https://thirty-days-en.<subdomain>.workers.dev
//                     or same-origin "/api" if you route the Worker under Pages.

const env = import.meta.env

// Same-origin mode: the Worker serves both the static app and the /api routes,
// so API calls are relative (workerUrl = '') and the Access cookie is same-origin
// (no cross-site cookie problems). Set VITE_SAME_ORIGIN=true for that build.
const sameOrigin = env.VITE_SAME_ORIGIN === 'true'

export const config = {
  workerUrl: sameOrigin ? '' : (env.VITE_WORKER_URL || '').replace(/\/+$/, ''),
  azureVoice: env.VITE_AZURE_VOICE || 'en-US-AvaMultilingualNeural',
}

const workerReady = sameOrigin || !!config.workerUrl

// Auth is Cloudflare Access (edge login) — whether a user is signed in is a
// RUNTIME check (see lib/access.ts → getIdentity), not a build-time flag. These
// flags only gate whether the premium UI is offered at all.
export const features = {
  /** Worker reachable → premium backend (AI + Azure token) available. */
  worker: workerReady,
  /** Claude-powered AI features (behind Access login). */
  ai: workerReady,
  /** Azure neural TTS + pronunciation assessment (behind Access login). */
  premiumSpeech: workerReady,
} as const
