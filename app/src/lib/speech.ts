// Speech wrappers.
//
// DEFAULT = the phone's own system voice (SpeechSynthesis): 0ms, offline, no
// login. Neural TTS round-trips ~2.5s through the Worker, which feels broken for
// tap-to-hear — so the natural-but-slow Aura/Azure voices are opt-in "HD" mode.
//   system mode → browser voice (instant)
//   HD mode     → word: human dictionary clip → Azure/CF neural; sentence: Azure/CF
// Either way it falls back down the chain on error.
import { azureAvailable, azureSpeak } from './azureSpeech'
import { cfVoiceAvailable, cfSpeak, playUrl, prefetchTts, stopCfSpeak } from './cfSpeech'
import { wordAudio } from './dictionary'

// ---- Voice mode (persisted) ----
export type VoiceMode = 'system' | 'hd'
const VOICE_KEY = 'voice-mode'
export function getVoiceMode(): VoiceMode {
  // Never-chosen → default HD. iOS speechSynthesis is muted by the ring/silent
  // switch and silently drops utterances in PWAs — every play button "does
  // nothing". Aura plays through the media channel (<audio>), which iOS keeps
  // audible even on silent. speakOne() still falls back to the system voice
  // whenever HD isn't reachable (caps not loaded / guest 401 / offline).
  try {
    const v = localStorage.getItem(VOICE_KEY)
    return v === 'hd' || v === 'system' ? v : 'hd'
  } catch { return 'system' }
}
export function setVoiceMode(m: VoiceMode): void {
  try { localStorage.setItem(VOICE_KEY, m) } catch { /* ignore */ }
}
/** Whether an HD neural voice is even reachable (needs the Worker backend). */
export function hdVoiceAvailable(): boolean {
  return azureAvailable() || cfVoiceAvailable()
}

export function ttsSupported(): boolean {
  // Azure / Cloudflare neural TTS or the browser's SpeechSynthesis.
  return azureAvailable() || cfVoiceAvailable() || browserTts()
}

// Concrete browser Web Speech guard — the browser-only helpers below MUST use
// this (not ttsSupported), or a premium build on a webview lacking
// speechSynthesis (e.g. WeChat/older Android WebView) would deref undefined and
// white-screen the app at startup (warmUpVoices runs before React mounts).
const browserTts = () => typeof window !== 'undefined' && 'speechSynthesis' in window

// Two voices so A/B dialogue sounds like two people, not one actor.
export type VoiceKey = 'a' | 'b'
let cachedVoice: SpeechSynthesisVoice | null = null
let cachedVoice2: SpeechSynthesisVoice | null = null

// Per-role NEURAL voices: speaker A = a warm female (asteria), B = a male
// (arcas), both @cf/deepgram/aura-2-en ids — so HD dialogue sounds like two
// people, matching the system-voice A/B contrast (no more single-actor HD).
const CF_VOICE: Record<VoiceKey, string> = { a: 'asteria', b: 'arcas' }
const cfVoiceFor = (k: VoiceKey | undefined): string | undefined => (k ? CF_VOICE[k] : undefined)

// Circuit breaker for the neural tier. Each dialogue line is an independent
// speakOne() call; without this, a single mid-dialogue neural failure (quota
// out / 5xx / offline) would drop just THAT line to the robotic system voice
// while siblings stay neural — the "suddenly mixes AI and system voice" bug.
// The one-shot retry in cfSpeak already absorbs transient blips, so reaching
// the catch means HD is genuinely down: cool it for a window and let the whole
// rest of the run play consistently on the system voice instead.
let hdColdUntil = 0
const HD_COOLDOWN_MS = 45000

const voiceScore = (v: SpeechSynthesisVoice) => {
  const n = v.name.toLowerCase()
  let s = 0
  if (/en-us/i.test(v.lang)) s += 3
  else if (/en-gb/i.test(v.lang)) s += 1
  if (/siri|neural|natural|premium|enhanced/.test(n)) s += 6
  if (/google|microsoft/.test(n)) s += 3
  if (/samantha|aaron|nicky|evan|ava|allison|joelle/.test(n)) s += 4 // good default iOS voices
  if (v.localService) s += 1 // on-device = instant, no network hiccup
  return s
}
// Rough gender guess from the voice name (best-effort; only used to CONTRAST the
// two dialogue voices, never surfaced to the user).
const femaleish = /samantha|ava|allison|susan|karen|moira|tessa|fiona|serena|nicky|joelle|zoe|female|woman/i
const maleish = /aaron|fred|daniel|tom|alex|arthur|oliver|rishi|male|man/i
const genderOf = (v: SpeechSynthesisVoice): 'f' | 'm' | '?' =>
  femaleish.test(v.name) ? 'f' : maleish.test(v.name) ? 'm' : '?'

function sortedEnVoices(): SpeechSynthesisVoice[] {
  if (!browserTts()) return []
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return []
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang))
  return [...(en.length ? en : voices)].sort((a, b) => voiceScore(b) - voiceScore(a))
}

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  return sortedEnVoices()[0] || null
}

// A second, contrasting voice for speaker B — prefer the best voice of the
// OPPOSITE gender guess; fall back to any other voice, then to the primary (in
// which case browserSpeak lowers the pitch so it still sounds like a 2nd person).
function pickSecondaryVoice(primary: SpeechSynthesisVoice | null): SpeechSynthesisVoice | null {
  const sorted = sortedEnVoices()
  if (!primary) return sorted[1] || sorted[0] || null
  const want = genderOf(primary) === 'f' ? 'm' : 'f'
  return (
    sorted.find((v) => v.name !== primary.name && genderOf(v) === want) ||
    sorted.find((v) => v.name !== primary.name) ||
    primary
  )
}

// Bumped on every speak()/stopSpeaking(); a call whose async work resolves after
// a newer tap bails instead of playing out of order on the shared audio element.
let speakGen = 0

/** Speak `text`. `onStart` fires when sound actually begins (loading → playing
 *  UI). `voiceKey` selects speaker A vs B so dialogue sounds like two people
 *  (system voice only — HD stays single-voice). Resolves when playback finishes
 *  (or is interrupted/superseded). */
// Speak ONE short chunk (word/sentence) through the current tier. Does NOT touch
// speakGen — the caller owns the generation token (so speak() and speakPassage()
// can each guard interruption their own way).
async function speakOne(
  text: string,
  rate: number,
  onStart: (() => void) | undefined,
  voiceKey: VoiceKey | undefined,
  superseded: () => boolean,
): Promise<void> {
  const t = text.trim()
  const isWord = !!t && !/\s/.test(t) && /^[A-Za-z][A-Za-z'-]*$/.test(t)
  // During the cooldown after a real neural failure, treat HD as unreachable so
  // the whole dialogue stays on ONE voice instead of interleaving tiers.
  const hd = getVoiceMode() === 'hd' && hdVoiceAvailable() && Date.now() >= hdColdUntil

  // SYSTEM mode (default): the phone voice, instantly. No network, no login.
  if (!hd) return browserSpeak(text, rate, onStart, voiceKey)

  // HD mode: natural neural voices. Single words prefer a real HUMAN recording
  // (neural TTS renders a lone word with trailing intonation). Budget the
  // foreign dictionary host to 900ms.
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
  if (!superseded() && azureAvailable()) {
    try {
      onStart?.()
      await azureSpeak(text, rate)
      return
    } catch {
      /* fall through */
    }
  }
  if (!superseded() && cfVoiceAvailable()) {
    try {
      await cfSpeak(isWord ? `${t}.` : text, rate, onStart, cfVoiceFor(voiceKey))
      return
    } catch (e) {
      // A login gate (401) isn't "HD down" — it's per-request auth. Anything
      // else (quota/5xx/network, after the retry) means the neural tier is
      // genuinely unreachable: cool it so the rest of the dialogue doesn't each
      // re-attempt and interleave neural with the system fallback.
      if (!(e instanceof Error && e.message === '请先登录')) hdColdUntil = Date.now() + HD_COOLDOWN_MS
      /* fall through to the system voice (with the A/B key preserved) */
    }
  }
  if (superseded()) return
  return browserSpeak(text, rate, onStart, voiceKey)
}

/** Speak `text`. `onStart` fires when sound actually begins. `voiceKey` picks
 *  speaker A/B (system voice) so dialogue sounds like two people. */
export async function speak(text: string, rate = 1, onStart?: () => void, voiceKey?: VoiceKey): Promise<void> {
  const myGen = ++speakGen
  return speakOne(text, rate, onStart, voiceKey, () => myGen !== speakGen)
}

// Split a passage into speakable sentences.
function toSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["'”’]?/g)
  return (parts && parts.length ? parts : [text]).map((s) => s.trim()).filter(Boolean)
}

/** Read a LONG passage reliably: system voices choke / cut off on long
 *  utterances, so speak it sentence-by-sentence. Interruptible via
 *  stopSpeaking() (or any newer speak()). `onStart` fires on the first sound. */
export async function speakPassage(text: string, rate = 1, onStart?: () => void): Promise<void> {
  const myGen = ++speakGen
  const superseded = () => myGen !== speakGen
  const sentences = toSentences(text)
  let started = false
  for (const s of sentences) {
    if (superseded()) return
    await speakOne(s, rate, () => { if (!started) { started = true; onStart?.() } }, undefined, superseded)
  }
}

/** Fire-and-forget cache warm for speech the user is ABOUT to tap (the visible
 *  flashcard word, the current listening sentence, the shadowing line). Only
 *  meaningful in HD mode — the system voice has nothing to warm. */
export function prefetchSpeak(text: string, voiceKey?: VoiceKey): void {
  if (getVoiceMode() !== 'hd' || !hdVoiceAvailable() || Date.now() < hdColdUntil) return
  const t = text.trim()
  if (!t) return
  const isWord = !/\s/.test(t) && /^[A-Za-z][A-Za-z'-]*$/.test(t)
  if (isWord) {
    // A single word prefers a real human recording (voice-agnostic); the CF
    // fallback warm must match the speaker the tap will use.
    wordAudio(t)
      .then((url) => { if (!url) prefetchTts(`${t}.`, cfVoiceFor(voiceKey)) })
      .catch(() => { /* best-effort */ })
    return
  }
  // Sentences: Azure synthesizes per-call via its SDK (no URL cache) — only the
  // CF tier benefits from warming. Warm the SAME voice the line will play in, or
  // the prefetch caches the wrong entry and the line hits the network live.
  if (!azureAvailable()) prefetchTts(t, cfVoiceFor(voiceKey))
}

function browserSpeak(text: string, rate = 1, onStart?: () => void, voiceKey?: VoiceKey): Promise<void> {
  return new Promise((resolve) => {
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
    if (!synth) {
      resolve()
      return
    }
    try { synth.cancel() } catch { /* ignore */ }
    // Un-stick the engine: Chrome/Safari can leave speechSynthesis wedged in a
    // paused state — especially after an AudioContext/getUserMedia session (the
    // Grok/CF live tutor) grabbed the audio route. resume() revives tap-to-hear.
    try { synth.resume() } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text)
    if (!cachedVoice) cachedVoice = pickEnglishVoice()
    if (!cachedVoice2) cachedVoice2 = pickSecondaryVoice(cachedVoice)
    const isB = voiceKey === 'b'
    const v = isB ? cachedVoice2 || cachedVoice : cachedVoice
    if (v) u.voice = v
    u.lang = v?.lang || 'en-US'
    u.rate = rate
    // Lower B's pitch — guarantees a distinct 2nd speaker even if only one system
    // voice exists (so single-voice devices still get an A/B contrast).
    u.pitch = isB ? 0.82 : 1.0
    let settled = false
    const done = () => { if (!settled) { settled = true; resolve() } }
    u.onstart = () => onStart?.()
    u.onend = done
    u.onerror = done
    // Safety net: speechSynthesis onstart/onend are notoriously unreliable on
    // iOS Safari / Chrome — if neither fires, the caller (and a SpeakButton's
    // loading spinner) would hang forever. Resolve after a GENEROUS estimate,
    // scaled by the speaking rate (slower rate → longer speech) with a wide cap,
    // so it only trips when the events truly flaked and never cuts off real
    // playback still in progress (slow mode, or a long passage chunk).
    const estMs = Math.min(60000, Math.max(3000, (text.length * 110 + 1500) / Math.max(0.5, rate)))
    setTimeout(done, estMs)
    synth.speak(u)
    // Chrome sometimes queues the utterance paused — nudge it once more.
    try { synth.resume() } catch { /* ignore */ }
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
    cachedVoice2 = pickSecondaryVoice(cachedVoice)
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

// Pronunciation similarity scoring moved to lib/shadowScore.ts (word-level LCS
// alignment with per-word hit marks, replacing the old overlap+edit-distance blend).
