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

const VoiceAgentBase = withVoice(Agent, { historyLimit: 20, audioFormat: 'mp3' })

export class VoiceTutor extends VoiceAgentBase<Env> {
  // Built-in Workers AI providers — no external API keys.
  transcriber = new WorkersAIFluxSTT(this.env.AI)
  tts = new WorkersAITTS(this.env.AI, { model: '@cf/deepgram/aura-1', speaker: 'asteria' })

  async onTurn(transcript: string, context: VoiceTurnContext) {
    const workersAi = createWorkersAI({ binding: this.env.AI })
    const result = streamText({
      model: workersAi('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
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
