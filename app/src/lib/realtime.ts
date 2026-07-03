import { config } from '../config'
import { authHeaders } from './access'
import type { LessonCtx } from './ai'

// OpenAI Realtime VOICE conversation over WebRTC.
//
// Two OpenAI endpoints are involved (kept side-by-side so a version bump is a
// one-line change):
//   1. SESSION MINT — server-side only. Our Worker POSTs to OpenAI
//      `/v1/realtime/sessions` with the real API key and returns a short-lived
//      ephemeral token ('ek_...'). The browser NEVER sees the real key; it calls
//      our Worker at `${config.workerUrl}/realtime/token`.
//   2. SDP EXCHANGE — client-side. The browser POSTs its SDP offer to
//      `https://api.openai.com/v1/realtime?model=<model>` with the ephemeral
//      token as a Bearer, and gets the SDP answer back.
//
// If OpenAI changes either the model, the SDP host, or the event shapes, adjust
// them here — the UI (LiveTutor) only sees the RtStatus / callback contract.

export type RtStatus = 'connecting' | 'listening' | 'speaking' | 'closed'

export interface RtSession {
  stop: () => void
  mute: (m: boolean) => void
}

interface StartOpts {
  lesson: LessonCtx
  onStatus: (s: RtStatus) => void
  onUserText: (t: string) => void
  onAiText: (t: string, done: boolean) => void
  onError: (msg: string) => void
}

interface TokenResponse {
  token: string
  model: string
  expiresAt: number
  error?: string
}

const SDP_HOST = 'https://api.openai.com/v1/realtime'

export async function startRealtime(opts: StartOpts): Promise<RtSession> {
  const { lesson, onStatus, onUserText, onAiText, onError } = opts

  onStatus('connecting')

  // 1. Mint an ephemeral session token via our Worker (never expose the real key).
  const res = await fetch(`${config.workerUrl}/realtime/token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ lesson }),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok) throw new Error(data.error || '连接失败')
  const { token, model } = data

  // 2. Peer connection.
  const pc = new RTCPeerConnection()

  // 3. Remote audio — the tutor's voice.
  const audioEl = new Audio()
  audioEl.autoplay = true
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0]
  }

  // 4. Mic — send the learner's voice up.
  const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
  ms.getTracks().forEach((t) => pc.addTrack(t, ms))

  // Running transcript of the tutor's current turn (accumulated from deltas).
  let aiRunning = ''

  // 5. Data channel — control + transcript events.
  const dc = pc.createDataChannel('oai-events')
  dc.onopen = () => {
    // Enable server-side VAD (so turns are auto-detected) + user transcription.
    dc.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
          input_audio_transcription: { model: 'whisper-1' },
        },
      }),
    )
    // Have the tutor greet first.
    dc.send(
      JSON.stringify({
        type: 'response.create',
        response: {
          instructions:
            "Greet the learner warmly in one short English sentence and ask an opening question about today's topic.",
        },
      }),
    )
    onStatus('listening')
  }

  dc.onmessage = (e) => {
    let evt: {
      type?: string
      delta?: string
      transcript?: string
      error?: { message?: string }
    }
    try {
      evt = JSON.parse(e.data)
    } catch {
      return
    }
    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        onStatus('listening')
        break
      case 'response.audio_transcript.delta':
        aiRunning += evt.delta ?? ''
        onAiText(aiRunning, false)
        onStatus('speaking')
        break
      case 'response.audio_transcript.done':
        onAiText(evt.transcript ?? aiRunning, true)
        aiRunning = ''
        break
      case 'conversation.item.input_audio_transcription.completed':
        onUserText(evt.transcript || '')
        break
      case 'error':
        onError(evt.error?.message || '出错了')
        break
    }
  }

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState
    if (st === 'failed' || st === 'disconnected' || st === 'closed') onStatus('closed')
  }

  // 6. SDP handshake — offer up, answer back from OpenAI.
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdpRes = await fetch(`${SDP_HOST}?model=${encodeURIComponent(model)}`, {
    method: 'POST',
    body: offer.sdp,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
  })
  if (!sdpRes.ok) throw new Error('实时连接失败')
  const answer = { type: 'answer' as const, sdp: await sdpRes.text() }
  await pc.setRemoteDescription(answer)

  // 7. Teardown — idempotent.
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      dc.close()
    } catch {
      /* ignore */
    }
    pc.getSenders().forEach((s) => s.track?.stop())
    ms.getTracks().forEach((t) => t.stop())
    audioEl.srcObject = null
    pc.close()
    onStatus('closed')
  }

  const mute = (m: boolean) => {
    ms.getAudioTracks().forEach((t) => (t.enabled = !m))
  }

  return { stop, mute }
}
