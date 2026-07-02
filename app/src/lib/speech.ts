// Speech wrappers. Premium path = Azure neural TTS + pronunciation assessment
// (via the Worker); free path = the browser Web Speech API. speak() routes to
// Azure when configured and falls back to the browser on any error.
import { azureAvailable, azureSpeak } from './azureSpeech'

export function ttsSupported(): boolean {
  // Azure TTS or the browser's SpeechSynthesis — either counts as "can speak".
  return azureAvailable() || (typeof window !== 'undefined' && 'speechSynthesis' in window)
}

let cachedVoice: SpeechSynthesisVoice | null = null

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  // Prefer a natural en-US / en-GB voice.
  const preferred =
    voices.find((v) => /en-US/i.test(v.lang) && /natural|google|samantha|female/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang))
  return preferred || voices[0] || null
}

export async function speak(text: string, rate = 1): Promise<void> {
  // Premium: Azure natural neural voice (fixes the robotic browser-TTS feel).
  if (azureAvailable()) {
    try {
      await azureSpeak(text, rate)
      return
    } catch {
      /* fall back to the browser voice below */
    }
  }
  return browserSpeak(text, rate)
}

function browserSpeak(text: string, rate = 1): Promise<void> {
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
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}

// Some browsers load voices asynchronously; call once on app start.
export function warmUpVoices() {
  if (!ttsSupported()) return
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
