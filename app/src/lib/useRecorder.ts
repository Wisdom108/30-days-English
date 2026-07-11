// ONE copy of the record → transcribe flow and its error triage. Three
// surfaces record speech (shadowing hero, 在在 drill card, retell panel);
// before this hook each carried its own drifting copy of the same cascade
// (one missed the permission branch, another the no-mic branch).
import { useEffect, useRef, useState } from 'react'
import { cfRecordAndTranscribe, cfVoiceAvailable, stopCfRecording } from './cfSpeech'
import { recognizeOnce, sttSupported } from './speech'

/** Unified 中文 triage for recorder/transcriber failures. Order matters: a
 *  permission problem must never read as "没听清". */
export function recorderErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : ''
  const msg = e instanceof Error ? e.message : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '需要麦克风权限：请在 设置 > 浏览器 > 麦克风 中允许后重试'
  }
  if (name === 'NotFoundError') return '未检测到麦克风'
  if (msg.includes('登录')) return '请先登录以使用录音'
  if (msg === 'recording-busy') return '上一段录音还没结束，稍等一下'
  if (msg.includes('额度')) return msg // 429 quota message from the worker — verbatim
  return '没听清，再试一次？'
}

export interface Recorder {
  /** Reactive: a take is in flight (drives the pulsing orb). */
  rec: boolean
  /** The CF recorder is available — the only backend that supports tap-to-stop. */
  cfPath: boolean
  canRecord: boolean
  /** Synchronous busy check (state `rec` lags one render behind). */
  isBusy: () => boolean
  /** One take: record → transcript. Called while busy it stops the CF take
   *  early and returns null (tap-to-stop / double-tap swallow). Throws on
   *  mic/quota/no-speech failures — render via recorderErrorMessage. */
  take: () => Promise<string | null>
}

export function useRecorder(): Recorder {
  const cfPath = cfVoiceAvailable()
  const canRecord = cfPath || sttSupported()
  const [rec, setRec] = useState(false)
  // Synchronous ownership flag for the CF recorder singleton: set before any
  // await (a double-tap can't start two takes) and read by the unmount cleanup
  // so leaving the view mid-take releases the mic.
  const takeRef = useRef(false)

  useEffect(
    () => () => {
      if (takeRef.current) stopCfRecording()
    },
    [],
  )

  const take = async (): Promise<string | null> => {
    if (takeRef.current) {
      if (cfPath) stopCfRecording()
      return null
    }
    takeRef.current = true
    setRec(true)
    try {
      const t = (cfPath ? await cfRecordAndTranscribe() : (await recognizeOnce()).transcript).trim()
      if (!t) throw new Error('no-speech') // the recognizer heard noise, not words
      return t
    } finally {
      takeRef.current = false
      setRec(false)
    }
  }

  return { rec, cfPath, canRecord, isBusy: () => takeRef.current, take }
}
