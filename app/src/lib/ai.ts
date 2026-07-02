import { config, features } from '../config'
import { getAccessToken } from './supabase'

// Typed client for the Cloudflare Worker AI endpoints. Every call carries the
// Supabase access token; the Worker verifies it, enforces per-user quota, and
// proxies to Claude (keys stay server-side).

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
  const token = await getAccessToken()
  if (!token) throw new AIError('请先登录')
  const res = await fetch(`${config.workerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
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
