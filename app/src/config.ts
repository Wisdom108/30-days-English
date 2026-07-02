// Runtime configuration + feature flags.
//
// The app is designed to DEGRADE GRACEFULLY: with zero env vars it still runs as
// a pure-static offline PWA (browser Web Speech, no AI, no login). As each
// service is configured, the matching premium feature lights up.
//
// Fill these in .env.local (see .env.example) — placeholders you supply later:
//   VITE_WORKER_URL        Cloudflare Worker base URL (AI proxy + Azure token)
//   VITE_SUPABASE_URL      Supabase project URL
//   VITE_SUPABASE_ANON_KEY Supabase anon (public) key

const env = import.meta.env

export const config = {
  workerUrl: (env.VITE_WORKER_URL || '').replace(/\/+$/, ''),
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
  // Optional: pin the Azure neural voice (falls back to a sensible default in the Worker)
  azureVoice: env.VITE_AZURE_VOICE || 'en-US-AvaMultilingualNeural',
}

const workerReady = !!config.workerUrl
const authReady = !!(config.supabaseUrl && config.supabaseAnonKey)

export const features = {
  /** CF Worker reachable → premium backend available. */
  worker: workerReady,
  /** Supabase configured → login/quota/sync available. */
  auth: authReady,
  /** Azure neural TTS + pronunciation assessment (needs Worker token + login). */
  premiumSpeech: workerReady && authReady,
  /** Claude-powered AI features (needs Worker + login for quota gating). */
  ai: workerReady && authReady,
} as const

/** True when everything for the full premium experience is wired up. */
export const fullyConfigured = features.worker && features.auth
