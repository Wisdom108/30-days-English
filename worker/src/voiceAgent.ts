import { Agent, type Connection } from 'agents'
import { withVoice, WorkersAIFluxSTT, WorkersAITTS, type VoiceTurnContext } from '@cloudflare/voice'
import { streamText } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import type { Env } from './index'

// Realtime voice tutor, 100% on Cloudflare (Workers AI STT + LLM + TTS), no
// external key. `@cloudflare/voice` streams audio over a WebSocket, transcribes,
// runs the LLM, and speaks the reply back — with built-in interrupt (barge-in)
// via context.signal. The browser talks to this Durable Object directly.

const TUTOR_SYSTEM =
  "You are a warm, encouraging English conversation tutor for a Chinese learner at CEFR A2-B1. " +
  "Speak ONLY in simple, clear English at a natural but slightly slow pace. Keep every reply to 1-2 short sentences. " +
  "Gently correct a major mistake by restating it correctly, then ask a short follow-up question to keep the conversation going. " +
  "Be patient, positive, and never switch to Chinese."

// Gapless call audio. The stock TTS asks Aura for MP3; separately-encoded MP3
// chunks each carry encoder-padding silence that clicks at every sentence
// boundary. Ask for WAV (linear PCM) instead — no padding, so the streamed
// sentences play seamlessly. aura-2-en accepts encoding/container per its
// Workers AI schema; if the binding ever rejects them we fall back to the
// library's default (MP3) so the call can never go silent.
class WavAuraTTS extends WorkersAITTS {
  constructor(private readonly ai: Env['AI'], private readonly opts: { model: string; speaker: string }) {
    super(ai, opts)
  }
  async synthesize(text: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    try {
      const res = (await this.ai.run(
        this.opts.model as never,
        { text, speaker: this.opts.speaker, encoding: 'linear16', container: 'wav' } as never,
        { returnRawResponse: true, ...(signal ? { signal } : {}) } as never,
      )) as unknown as Response
      return await res.arrayBuffer()
    } catch {
      return super.synthesize(text, signal) // params rejected → default MP3, still plays
    }
  }
}

const VoiceAgentBase = withVoice(Agent, { historyLimit: 20, audioFormat: 'wav' })

export class VoiceTutor extends VoiceAgentBase<Env> {
  // Built-in Workers AI providers — no external API keys.
  transcriber = new WorkersAIFluxSTT(this.env.AI)
  // aura-2-en is the newer, higher-fidelity Deepgram voice the rest of the app
  // already uses for read-aloud; aura-1 was the source of the "telephone/tinny"
  // timbre on the free call. WAV output (above) removes the sentence-boundary clicks.
  tts = new WavAuraTTS(this.env.AI, { model: '@cf/deepgram/aura-2-en', speaker: 'asteria' })

  async onTurn(transcript: string, context: VoiceTurnContext) {
    const workersAi = createWorkersAI({ binding: this.env.AI })
    const result = streamText({
      // Small fp8 model — voice turns need low latency far more than raw smarts,
      // and replies are only 1-2 short sentences.
      model: workersAi('@cf/meta/llama-3.1-8b-instruct-fp8'),
      system: TUTOR_SYSTEM,
      messages: [
        ...context.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: transcript },
      ],
      abortSignal: context.signal, // user interrupts → stop generating
    })
    return result.textStream
  }

  async onCallStart(connection: Connection) {
    await this.speak(connection, "Hi! I'm your English tutor. What would you like to talk about today?")
  }
}
