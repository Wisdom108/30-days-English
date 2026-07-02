import { config } from '../config'
import { authHeaders } from './access'
import { serverCaps } from './caps'

// Azure Speech: natural neural TTS + phoneme-level pronunciation assessment.
// The SDK is heavy (~1.5MB) so it is dynamically imported on first use. The
// subscription key never reaches the browser — a short-lived token is minted by
// the Worker's /speech/token endpoint.

type SDK = typeof import('microsoft-cognitiveservices-speech-sdk')
let sdkPromise: Promise<SDK> | null = null
function loadSdk(): Promise<SDK> {
  if (!sdkPromise) sdkPromise = import('microsoft-cognitiveservices-speech-sdk')
  return sdkPromise
}

interface Tok {
  token: string
  region: string
  voice: string
  at: number
}
let cachedToken: Tok | null = null

async function getToken(): Promise<Tok> {
  if (cachedToken && Date.now() - cachedToken.at < 8.5 * 60 * 1000) return cachedToken
  const res = await fetch(`${config.workerUrl}/speech/token`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  if (res.status === 401) throw new Error('请先登录')
  if (!res.ok) throw new Error('语音服务不可用')
  const data = (await res.json()) as { token: string; region: string; voice: string }
  cachedToken = { ...data, at: Date.now() }
  return cachedToken
}

export function azureAvailable(): boolean {
  return serverCaps().speech
}

// Track the in-flight synthesizer so a new speak() halts the previous one —
// otherwise rapid taps stack multiple voices playing at once.
let activeSynth: { close(): void; stopSpeakingAsync?: (cb?: () => void) => void } | null = null

function stopActive() {
  const s = activeSynth
  activeSynth = null
  if (!s) return
  try {
    s.stopSpeakingAsync?.(() => {
      try {
        s.close()
      } catch {
        /* ignore */
      }
    })
  } catch {
    /* ignore */
  }
}

/** Synthesize `text` with a natural neural voice and play it. */
export async function azureSpeak(text: string, rate = 1): Promise<void> {
  const SpeechSDK = await loadSdk()
  const { token, region, voice } = await getToken()
  stopActive()
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
  speechConfig.speechSynthesisVoiceName = config.azureVoice || voice
  const synth = new SpeechSDK.SpeechSynthesizer(speechConfig)
  activeSynth = synth
  const ratePct = `${Math.round((rate - 1) * 100)}%`
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${config.azureVoice || voice}"><prosody rate="${ratePct}">${escapeXml(text)}</prosody></voice></speak>`
  return new Promise<void>((resolve, reject) => {
    synth.speakSsmlAsync(
      ssml,
      (result) => {
        if (activeSynth === synth) activeSynth = null
        synth.close()
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) resolve()
        else reject(new Error('合成失败'))
      },
      (err) => {
        if (activeSynth === synth) activeSynth = null
        synth.close()
        reject(new Error(String(err)))
      },
    )
  })
}

export interface PronScore {
  accuracy: number
  fluency: number
  completeness: number
  pronunciation: number
  prosody?: number
  transcript: string
  words: { word: string; accuracy: number; errorType: string }[]
}

/** Record from the mic and assess pronunciation against `referenceText`. */
export async function azureAssess(referenceText: string): Promise<PronScore> {
  const SpeechSDK = await loadSdk()
  const { token, region } = await getToken()
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region)
  speechConfig.speechRecognitionLanguage = 'en-US'
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()

  const paConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  )
  paConfig.enableProsodyAssessment = true

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig)
  paConfig.applyTo(recognizer)

  return new Promise<PronScore>((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        try {
          if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
            reject(new Error('没听清，请再试一次'))
            return
          }
          const pa = SpeechSDK.PronunciationAssessmentResult.fromResult(result)
          const words = (pa.detailResult?.Words || []).map((w: any) => ({
            word: w.Word as string,
            accuracy: Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0),
            errorType: (w.PronunciationAssessment?.ErrorType as string) || 'None',
          }))
          resolve({
            accuracy: Math.round(pa.accuracyScore),
            fluency: Math.round(pa.fluencyScore),
            completeness: Math.round(pa.completenessScore),
            pronunciation: Math.round(pa.pronunciationScore),
            prosody: pa.prosodyScore != null ? Math.round(pa.prosodyScore) : undefined,
            transcript: result.text,
            words,
          })
        } catch (e) {
          reject(e instanceof Error ? e : new Error('评测失败'))
        } finally {
          recognizer.close()
        }
      },
      (err) => {
        recognizer.close()
        reject(new Error(String(err)))
      },
    )
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
