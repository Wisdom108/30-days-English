import { config } from '../config'
import { authHeaders } from './access'
import { serverCaps } from './caps'

// Cloudflare Workers AI voice (free, no key): Aura-2 neural TTS + Whisper STT.
// Served by the same Worker as the AI endpoints; auth via the shared passcode /
// Access context (authHeaders + credentials).

export function cfVoiceAvailable(): boolean {
  return serverCaps().cfVoice
}

// ---------------------------------------------------------------------------
// Shared, iOS-unlocked <audio> element.
//
// iOS Safari blocks programmatic audio.play() that isn't tied to a live user
// gesture — and a fetch()→play() sequence loses the gesture across the await,
// so a fresh `new Audio()` per call is REJECTED and the app silently falls back
// to the robotic browser voice (which is why the neural voice "sounded weird /
// different every time"). Fix: reuse ONE element and "bless" it by playing a
// silent clip during the first user gesture; afterwards post-await plays work.
// ---------------------------------------------------------------------------
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='
let el: HTMLAudioElement | null = null
let unlocked = false

function audioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio()
    el.setAttribute('playsinline', 'true')
    el.preload = 'auto'
  }
  return el
}

function unlock() {
  if (unlocked || typeof window === 'undefined') return
  unlocked = true
  const a = audioEl()
  a.src = SILENT_WAV
  a.play().then(() => { a.pause(); a.currentTime = 0 }).catch(() => {})
}
if (typeof window !== 'undefined') {
  const on = () => unlock()
  for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(ev, on, { once: true, capture: true })
  }
}

// TTS cache: same text → identical audio (kills the "different every time"
// feel and saves the daily speech quota on repeated taps).
const ttsCache = new Map<string, string>()
const MAX_CACHE = 60

async function ttsUrl(text: string): Promise<string> {
  const hit = ttsCache.get(text)
  if (hit) return hit
  const res = await fetch(`${config.workerUrl}/speech/tts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  })
  if (res.status === 401) throw new Error('请先登录')
  if (!res.ok) throw new Error('语音合成失败')
  const url = URL.createObjectURL(await res.blob())
  ttsCache.set(text, url)
  if (ttsCache.size > MAX_CACHE) {
    // Evict the oldest entry that ISN'T the currently-loaded blob — revoking or
    // dropping the playing src would leak it AND force a re-fetch on replay.
    const curSrc = audioEl().src
    for (const k of ttsCache.keys()) {
      if (k === text) continue
      const u = ttsCache.get(k)
      if (u && u === curSrc) continue
      if (u) URL.revokeObjectURL(u)
      ttsCache.delete(k)
      break
    }
  }
  return url
}

// One element is shared, so a new play (or a stop) must settle the previous
// promise — otherwise its awaiter (e.g. a SpeakButton) stays stuck "busy".
// `playSeq` tags each play so a SUPERSEDED call's late events (notably the
// AbortError that a.pause() throws into the previous play() promise) can't wipe
// the CURRENT playback's handlers and strand its awaiter forever.
let playSeq = 0
let settlePrev: (() => void) | null = null

export function stopCfSpeak() {
  if (settlePrev) { settlePrev(); settlePrev = null }
  if (el) {
    try { el.pause() } catch { /* ignore */ }
  }
}

/** Play a ready audio URL (blob or remote) through the unlocked element. Rejects
 *  on failure so the caller can fall back to the browser voice. `onStart` fires
 *  when sound actually begins — callers use it to flip loading → playing UI. */
export function playUrl(url: string, rate = 1, onStart?: () => void): Promise<void> {
  unlock()
  const a = audioEl()
  if (settlePrev) { settlePrev(); settlePrev = null }
  try { a.pause() } catch { /* ignore */ }
  const mySeq = ++playSeq
  a.src = url
  a.playbackRate = rate
  return new Promise<void>((resolve, reject) => {
    // Only the live play touches shared state; a stale call returns early so it
    // can't null the current play's handlers/settlePrev.
    const finish = (settle: () => void) => {
      if (mySeq !== playSeq) return
      a.onended = null
      a.onerror = null
      settlePrev = null
      settle()
    }
    settlePrev = () => finish(resolve) // interrupted → treat as done
    a.onended = () => finish(resolve)
    a.onerror = () => finish(() => reject(new Error('播放失败')))
    a.play().then(
      () => { if (mySeq === playSeq) onStart?.() },
      (e) => finish(() => reject(e instanceof Error ? e : new Error('播放失败'))),
    )
  })
}

/** Synthesize `text` with the neural voice and play it (cached). */
export async function cfSpeak(text: string, rate = 1, onStart?: () => void): Promise<void> {
  await playUrl(await ttsUrl(text), rate, onStart)
}

/** Warm the TTS cache for `text` without playing — call when the text becomes
 *  visible so the first tap is instant instead of waiting on synthesis. */
export function prefetchTts(text: string): void {
  if (!cfVoiceAvailable() || ttsCache.has(text)) return
  ttsUrl(text).catch(() => { /* best-effort */ })
}

// --- STT (Whisper) --------------------------------------------------------

/** Send recorded audio to Whisper and return the transcript. */
export async function cfTranscribe(blob: Blob): Promise<string> {
  const res = await fetch(`${config.workerUrl}/speech/stt`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': blob.type || 'application/octet-stream', ...authHeaders() },
    body: blob,
  })
  if (res.status === 401) throw new Error('请先登录')
  if (!res.ok) throw new Error('识别失败')
  const data = (await res.json()) as { text?: string }
  return (data.text || '').trim()
}

// Live recorder handle so the UI can finish a take early (tap-to-stop) instead
// of waiting for the silence detector / hard cap.
let activeStop: (() => void) | null = null

/** Stop the in-flight recording early — transcription proceeds with what was heard. */
export function stopCfRecording(): void {
  activeStop?.()
}

/** Record from the mic (auto-stops on silence) then transcribe via Whisper. */
export async function cfRecordAndTranscribe(maxMs = 10000): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const chunks: BlobPart[] = []
  const rec = new MediaRecorder(stream)
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  // Silence auto-stop via Web Audio RMS: stop ~1.2s after speech ends, or on a
  // hard cap, or if nothing is heard within the first few seconds.
  const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  const source = ac.createMediaStreamSource(stream)
  const analyser = ac.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)

  return new Promise<string>((resolve, reject) => {
    let stopped = false
    let heardSpeech = false
    let silenceStart = 0
    const t0 = Date.now()

    const cleanup = () => {
      clearInterval(poll)
      try {
        source.disconnect()
        ac.close()
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop())
    }

    const stop = () => {
      if (stopped) return
      stopped = true
      if (activeStop === stop) activeStop = null
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    activeStop = stop

    const poll = setInterval(() => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      const now = Date.now()
      if (rms > 0.04) {
        heardSpeech = true
        silenceStart = 0
      } else if (heardSpeech) {
        if (!silenceStart) silenceStart = now
        else if (now - silenceStart > 1200) stop()
      }
      if (now - t0 > maxMs) stop()
      if (!heardSpeech && now - t0 > 6000) stop() // nothing heard
    }, 100)

    rec.onstop = async () => {
      cleanup()
      if (!heardSpeech || !chunks.length) {
        reject(new Error('no-speech'))
        return
      }
      try {
        resolve(await cfTranscribe(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('识别失败'))
      }
    }
    rec.onerror = () => {
      cleanup()
      reject(new Error('录音失败'))
    }
    rec.start()
  })
}
