import { config, features } from '../config'
import { authHeaders } from './access'

// Typed client for the Cloudflare Worker AI endpoints. Every call carries the
// auth context (Access cookie and/or passcode header); the Worker verifies it,
// enforces per-user quota, and runs Cloudflare Workers AI (all server-side).

export interface LessonCtx {
  day?: number
  theme?: string
  title_en?: string
  grammar?: string
  level?: string
}

export interface Correction {
  original: string
  fixed: string
  why_zh: string
}
export interface WritingFeedback {
  corrections: Correction[]
  polished: string
  overall_zh: string
  score: number
}

export class AIError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!features.ai) throw new AIError('AI 未配置')
  const res = await fetch(`${config.workerUrl}${path}`, {
    method: 'POST',
    credentials: 'include', // carry the Cloudflare Access session cookie
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new AIError('请先登录')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AIError((data as { error?: string }).error || `请求失败 (${res.status})`)
  return data as T
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

export function aiChat(messages: ChatMsg[], lesson: LessonCtx, scenario?: string): Promise<{ reply: string }> {
  return post('/ai/chat', { messages, lesson, scenario })
}

export function aiWriting(text: string, lesson: LessonCtx, prompt?: string): Promise<{ feedback: WritingFeedback }> {
  return post('/ai/writing', { text, lesson, prompt })
}

export function aiTutor(question: string, lesson: LessonCtx, history?: ChatMsg[]): Promise<{ reply: string }> {
  return post('/ai/tutor', { question, lesson, history })
}

export function aiCoach(target: string, assessment: unknown, lesson: LessonCtx): Promise<{ reply: string }> {
  return post('/ai/coach', { target, assessment, lesson })
}
