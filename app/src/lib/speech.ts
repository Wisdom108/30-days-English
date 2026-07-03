// Speech wrappers. Voice tiers, best first:
//   1. Azure neural TTS + phoneme pronunciation assessment (if AZURE key set)
//   2. Cloudflare Workers AI: Aura-2 neural TTS + Whisper STT (free, no key)
//   3. Browser Web Speech API (offline fallback)
// speak() tries each in order, falling back on any error.
import { azureAvailable, azureSpeak } from './azureSpeech'
import { cfVoiceAvailable, cfSpeak, playUrl, prefetchTts, stopCfSpeak } from './cfSpeech'
import { wordAudio } from './dictionary'

export function ttsSupported(): boolean {
  // Azure / Cloudflare neural TTS or the browser's SpeechSynthesis.
  return azureAvailable() || cfVoiceAvailable() || browserTts()
}

// Concrete browser Web Speech guard — the browser-only helpers below MUST use
// this (not ttsSupported), or a premium build on a webview lacking
// speechSynthesis (e.g. WeChat/older Android WebView) would deref undefined and
// white-screen the app at startup (warmUpVoices runs before React mounts).
const browserTts = () => typeof window !== 'undefined' && 'speechSynthesis' in window

let cachedVoice: SpeechSynthesisVoice | null = null

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!browserTts()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  // Prefer a natural en-US / en-GB voice.
  const preferred =
    voices.find((v) => /en-US/i.test(v.lang) && /natural|google|samantha|female/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang))
  return preferred || voices[0] || null
}

// Bumped on every speak()/stopSpeaking(); a call whose async work resolves after
// a newer tap bails instead of playing out of order on the shared audio element.
let speakGen = 0

/** Speak `text`. `onStart` fires when sound actually begins (loading → playing
 *  UI). Resolves when playback finishes (or is interrupted/superseded). */
export async function speak(text: string, rate = 1, onStart?: () => void): Promise<void> {
  const myGen = ++speakGen
  const superseded = () => myGen !== speakGen
  const t = text.trim()
  const isWord = !!t && !/\s/.test(t) && /^[A-Za-z][A-Za-z'-]*$/.test(t)

  // Single words: prefer a real HUMAN recording. Sentence-trained neural TTS
  // renders a lone word with trailing intonation (it "sounds cut from a
  // sentence"); a dictionary recording is a clean, natural, consistent word.
  // Budget the (foreign, sometimes slow) dictionary host to 900ms — past that
  // the neural voice takes over; the fetch keeps warming the cache for replays.
  if (isWord) {
    try {
      const url = await Promise.race([
        wordAudio(t),
        new Promise<null>((r) => setTimeout(() => r(null), 900)),
      ])
      if (superseded()) return
      if (url) {
        await playUrl(url, rate, onStart)
        return
      }
    } catch {
      /* fall through to synth */
    }
  }

  // Tier 1: Azure natural neural voice (fixes the robotic browser-TTS feel).
  if (!superseded() && azureAvailable()) {
    try {
      onStart?.() // SDK plays via its own pipeline; treat dispatch as start
      await azureSpeak(text, rate)
      return
    } catch {
      /* fall through */
    }
  }
  // Tier 2: Cloudflare Aura-2 neural voice (free, no key). Append a period to a
  // lone word so Aura gives it complete, standalone intonation.
  if (!superseded() && cfVoiceAvailable()) {
    try {
      await cfSpeak(isWord ? `${t}.` : text, rate, onStart)
      return
    } catch {
      /* fall through */
    }
  }
  if (superseded()) return
  return browserSpeak(text, rate, onStart)
}

/** Fire-and-forget cache warm for speech the user is ABOUT to tap (the visible
 *  flashcard word, the current listening sentence, the shadowing line). Words
 *  warm the free dictionary recording first, then fall back to neural TTS. */
export function prefetchSpeak(text: string): void {
  const t = text.trim()
  if (!t) return
  const isWord = !/\s/.test(t) && /^[A-Za-z][A-Za-z'-]*$/.test(t)
  if (isWord) {
    wordAudio(t)
      .then((url) => { if (!url) prefetchTts(`${t}.`) })
      .catch(() => { /* best-effort */ })
    return
  }
  // Sentences: Azure synthesizes per-call via its SDK (no URL cache) — only the
  // CF tier benefits from warming.
  if (!azureAvailable()) prefetchTts(t)
}

function browserSpeak(text: string, rate = 1, onStart?: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (!cachedVoice) cachedVoice = pickEnglishVoice()
    if (cachedVoice) u.voice = cachedVoice
    u.lang = cachedVoice?.lang || 'en-US'
    u.rate = rate
    u.onstart = () => onStart?.()
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  speakGen++ // invalidate any in-flight speak() so it won't start a late playback
  stopCfSpeak()
  if (browserTts()) window.speechSynthesis.cancel()
}

// Some browsers load voices asynchronously; call once on app start.
export function warmUpVoices() {
  if (!browserTts()) return
  const load = () => {
    cachedVoice = pickEnglishVoice()
  }
  load()
  window.speechSynthesis.onvoiceschanged = load
}

// ---- Speech recognition (for shadowing / speaking scoring) ----
type SpeechRecognitionType = any

export function sttSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  )
}

export interface RecognitionResult {
  transcript: string
}

export function recognizeOnce(timeoutMs = 12000): Promise<RecognitionResult> {
  return new Promise((resolve, reject) => {
    if (!sttSupported()) {
      reject(new Error('SpeechRecognition not supported'))
      return
    }
    const Ctor: SpeechRecognitionType =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false

    // Guard so the promise settles exactly once. Without this, a recognizer that
    // fires `onend` with no result (common when the mic hears nothing, and the
    // norm on iOS Safari) would leave the caller's button stuck on "听着…" forever.
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      finish(() => reject(new Error('timeout')))
    }, timeoutMs)

    function finish(fn: () => void) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? ''
      finish(() => resolve({ transcript }))
    }
    rec.onerror = (e: any) => finish(() => reject(new Error(e.error || 'recognition error')))
    rec.onend = () => finish(() => reject(new Error('no-speech')))

    try {
      rec.start()
    } catch (err) {
      finish(() => reject(err as Error))
    }
  })
}

// ---- Pronunciation similarity scoring ----
// Normalizes both strings and computes a word-overlap + edit-distance score 0-100.
export function scorePronunciation(target: string, spoken: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  const t = norm(target)
  const s = norm(spoken)
  if (!t || !s) return 0
  const tWords = t.split(' ')
  const sWords = new Set(s.split(' '))
  const matched = tWords.filter((w) => sWords.has(w)).length
  const overlap = matched / tWords.length
  const dist = levenshtein(t, s)
  const editScore = 1 - dist / Math.max(t.length, s.length)
  const score = Math.round((overlap * 0.6 + Math.max(0, editScore) * 0.4) * 100)
  return Math.max(0, Math.min(100, score))
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}
