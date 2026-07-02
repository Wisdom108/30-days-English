import { config } from '../config'
import { authHeaders } from './access'
import { serverCaps } from './caps'

// Cloudflare Workers AI voice (free, no key): Aura-2 neural TTS + Whisper STT.
// Served by the same Worker as the AI endpoints; auth via the shared passcode /
// Access context (authHeaders + credentials).

export function cfVoiceAvailable(): boolean {
  return serverCaps().cfVoice
}

// --- TTS (Aura-2) ---------------------------------------------------------
let activeAudio: HTMLAudioElement | null = null

export function stopCfSpeak() {
  if (activeAudio) {
    try {
      activeAudio.pause()
    } catch {
      /* ignore */
    }
    activeAudio = null
  }
}

/** Synthesize `text` with a neural voice and play it. Rejects on any failure so
 *  the caller can fall back to the browser voice. */
export async function cfSpeak(text: string, rate = 1): Promise<void> {
  const res = await fetch(`${config.workerUrl}/speech/tts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  })
  if (res.status === 401) throw new Error('请先登录')
  if (!res.ok) throw new Error('语音合成失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  stopCfSpeak()
  const audio = new Audio(url)
  audio.playbackRate = rate
  activeAudio = audio
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('播放失败'))
      audio.play().catch(reject)
    })
  } finally {
    if (activeAudio === audio) activeAudio = null
    URL.revokeObjectURL(url)
  }
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
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }

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
