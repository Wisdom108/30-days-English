import { config } from '../config'
import { authHeaders } from './access'
import type { LessonCtx } from './ai'

// xAI Grok NATIVE realtime voice (speech-to-speech) over a raw WebSocket.
// The browser connects to wss://api.x.ai/v1/realtime with an ephemeral token as
// a WS subprotocol (the real key stays in the Worker). Audio is PCM16 @ 24kHz:
// we capture the mic, downsample via an AudioContext, base64 the PCM, and stream
// it up; the tutor's audio comes back as base64 PCM deltas we schedule for
// gapless playback. server_vad gives turn-taking + barge-in.
//
// A few event names / the ephemeral shape are inferred from xAI's
// OpenAI-Realtime-compatible docs — if something doesn't fire, the switch below
// is where to adjust.

export type GrokStatus = 'connecting' | 'listening' | 'speaking' | 'closed'
export interface GrokSession {
  stop: () => void
  mute: (m: boolean) => void
}
interface StartOpts {
  lesson: LessonCtx
  persona?: string // character preset key (emma/aria/rex/leo/sam) — picks the voice + tone
  scenario?: string // roleplay brief — folded into instructions SERVER-side (single source)
  onStatus: (s: GrokStatus) => void
  onUserText: (t: string) => void
  onAiText: (t: string, done: boolean) => void
  onError: (msg: string) => void
}

const XAI_WS = 'wss://api.x.ai/v1/realtime'
const RATE = 24000

// Float32 [-1,1] → base64 PCM16 (little-endian).
function f32ToPcm16Base64(f32: Float32Array): string {
  const buf = new ArrayBuffer(f32.length * 2)
  const view = new DataView(buf)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
// base64 PCM16 (LE) → Float32.
function base64ToF32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const n = bytes.length >> 1
  const view = new DataView(bytes.buffer)
  const f32 = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = view.getInt16(i * 2, true)
    f32[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return f32
}

export async function startGrok(opts: StartOpts): Promise<GrokSession> {
  const { lesson, persona, scenario, onStatus, onUserText, onAiText, onError } = opts
  onStatus('connecting')

  // 1. mint an ephemeral token via our Worker.
  const res = await fetch(`${config.workerUrl}/grok/token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ lesson, persona, scenario }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    token?: string
    model?: string
    voice?: string
    instructions?: string
    error?: string
  }
  if (!res.ok || !data.token) throw new Error(data.error || '连接失败')
  const model = data.model || 'grok-voice-latest'
  const voice = data.voice || 'eve'
  const instructions = data.instructions || ''
  const proto = data.token.startsWith('xai-client-secret.') ? data.token : `xai-client-secret.${data.token}`

  // 2. WebSocket (ephemeral token as subprotocol).
  const ws = new WebSocket(`${XAI_WS}?model=${encodeURIComponent(model)}`, [proto])
  // Two SEPARATE contexts: a clean one that only plays the tutor's audio, and a
  // dedicated one for mic capture. Sharing a single context lets the mic's
  // main-thread ScriptProcessor stall playback → crackle.
  //
  // Playback context uses the hardware's NATIVE rate (no forced 24k). Forcing a
  // context to a non-native rate makes the browser resample the whole output at
  // that odd rate, which adds a persistent hiss/static ("收音机底噪"); instead we
  // tag each buffer as 24kHz (its true rate) and let the browser resample it to
  // native with its good resampler. The mic context stays at 24k because Grok
  // expects 24kHz PCM input.
  const playCtx = new AudioContext()
  const micCtx = new AudioContext({ sampleRate: RATE })

  // Gapless PCM playback queue. A jitter buffer of lead time absorbs network
  // jitter so chunks never underrun (an underrun leaves a gap = a click, and a
  // stream of clicks is the "电流声").
  const JITTER = 0.12
  let nextTime = 0
  const sources = new Set<AudioBufferSourceNode>()
  const playChunk = (f32: Float32Array) => {
    const buf = playCtx.createBuffer(1, f32.length, RATE)
    buf.getChannelData(0).set(f32)
    const src = playCtx.createBufferSource()
    src.buffer = buf
    src.connect(playCtx.destination)
    const t = Math.max(playCtx.currentTime + JITTER, nextTime)
    src.start(t)
    nextTime = t + buf.duration
    sources.add(src)
    src.onended = () => sources.delete(src)
    onStatus('speaking')
  }
  const flushPlayback = () => {
    sources.forEach((s) => { try { s.stop() } catch { /* ignore */ } })
    sources.clear()
    nextTime = 0
  }

  let ms: MediaStream | null = null
  let proc: ScriptProcessorNode | null = null
  let muted = false
  let aiRunning = ''

  ws.onopen = async () => {
    // The ephemeral-token mint does NOT accept session config, so we apply it
    // here: instructions/voice/VAD + enable input transcription for subtitles.
    // Audio stays the default (24kHz PCM), which matches our capture/playback —
    // no format override needed (a wrong nesting would break audio).
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        ...(instructions ? { instructions } : {}),
        voice,
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: {},
      },
    }))
    try {
      // Echo cancellation + noise suppression: cleaner mic, and (on speakers)
      // stops the tutor's own voice looping back into the mic → fewer artifacts
      // and spurious barge-ins.
      ms = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (micCtx.state === 'suspended') await micCtx.resume()
      if (playCtx.state === 'suspended') await playCtx.resume()
      const source = micCtx.createMediaStreamSource(ms)
      proc = micCtx.createScriptProcessor(4096, 1, 1)
      const zero = micCtx.createGain()
      zero.gain.value = 0 // route capture graph to destination w/o echoing the mic
      source.connect(proc)
      proc.connect(zero)
      zero.connect(micCtx.destination)
      proc.onaudioprocess = (e) => {
        if (muted || ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: f32ToPcm16Base64(e.inputBuffer.getChannelData(0)) }))
      }
      onStatus('listening')
    } catch {
      onError('麦克风打开失败，请检查权限')
    }
  }

  ws.onmessage = (e) => {
    let evt: { type?: string; delta?: string; transcript?: string; error?: { message?: string } }
    try { evt = JSON.parse(typeof e.data === 'string' ? e.data : '') } catch { return }
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        flushPlayback() // barge-in: user talks over the tutor
        onStatus('listening')
        break
      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed':
        onUserText(evt.transcript || '')
        break
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (evt.delta) playChunk(base64ToF32(evt.delta))
        break
      // The tutor's spoken text: xAI emits `response.output_text.delta`; the
      // `*audio_transcript*` variants are kept as OpenAI-compat fallbacks.
      case 'response.output_text.delta':
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        aiRunning += evt.delta ?? ''
        onAiText(aiRunning, false)
        break
      case 'response.output_text.done':
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        onAiText(evt.transcript ?? aiRunning, true)
        aiRunning = ''
        break
      case 'response.done':
        if (aiRunning) { onAiText(aiRunning, true); aiRunning = '' }
        break
      case 'error':
        onError(evt.error?.message || '出错了')
        break
    }
  }
  ws.onerror = () => onError('实时连接出错')
  ws.onclose = () => onStatus('closed')

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    try { if (proc) proc.onaudioprocess = null } catch { /* ignore */ }
    try { proc?.disconnect() } catch { /* ignore */ }
    // Release the mic FIRST: stopping the audio tracks drops the OS session out
    // of record/play-and-record mode and hands the output route back to ordinary
    // playback (speechSynthesis + <audio>). Leaving it open is what silences the
    // rest of the app's TTS after a realtime call ends.
    ms?.getAudioTracks().forEach((t) => { t.enabled = false; try { t.stop() } catch { /* ignore */ } })
    ms?.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
    flushPlayback()
    try { ws.close() } catch { /* ignore */ }
    // Close both contexts last (each returns a promise; swallow rejections).
    micCtx.close().catch(() => { /* already closed */ })
    playCtx.close().catch(() => { /* already closed */ })
    onStatus('closed')
  }
  const mute = (m: boolean) => {
    muted = m
    ms?.getAudioTracks().forEach((t) => (t.enabled = !m))
  }
  return { stop, mute }
}
