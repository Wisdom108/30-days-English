import { callAI, parseJson, json, type Env, type Msg } from './index'
import { readSession } from './session'
import { GUARD, type LessonCtx } from './prompts'

// 在在 (Zaizai) — the AI coach living in the message feed. This file is the
// single source of truth for the persona, the scenario-pack generator, and the
// long-term memory loop (D1 `memories`, account users only). The /ai/zaizai and
// /ai/scenario branches in index.ts:handleAI consume these.

export interface ZaizaiStats {
  day?: number
  blocksDoneToday?: number
  streak?: number
  dueCards?: number
}

/** Sanitize client-reported stats (numbers only, clamped). */
export function statsFrom(v: unknown): ZaizaiStats {
  const o = (v || {}) as Record<string, unknown>
  const num = (x: unknown, max: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(0, Math.round(x)), max) : undefined
  return {
    day: num(o.day, 30),
    blocksDoneToday: num(o.blocksDoneToday, 5),
    streak: num(o.streak, 3650),
    dueCards: num(o.dueCards, 9999),
  }
}

// ---------------------------------------------------------------- persona
export function zaizaiSystem(memories: string, l: LessonCtx, stats: ZaizaiStats, mode: 'chat' | 'brief'): string {
  const facts: string[] = []
  if (stats.day != null) facts.push(`课程进行到 Day ${stats.day}/30`)
  if (stats.blocksDoneToday != null) facts.push(`今天完成了 ${stats.blocksDoneToday}/5 个练习块`)
  if (stats.streak != null) facts.push(`已连续学习 ${stats.streak} 天`)
  if (stats.dueCards != null) facts.push(`有 ${stats.dueCards} 张卡片待复习`)
  const statsLine = facts.length ? `学员数据:${facts.join(',')}。` : ''
  const lessonLine = l.day
    ? `今日课程:Day ${l.day}「${l.title_en ?? ''}」,主题 ${l.theme ?? ''}。` + (l.grammar ? `语法点:${l.grammar}。` : '')
    : ''
  const memoryBlock = memories.trim() ? `你记得学员的这些事(开场要引用其中的具体事实):\n${memories.trim()}\n` : ''
  const day30Done = stats.day === 30 && (stats.blocksDoneToday ?? 0) >= 5
  const egg = day30Done
    ? '学员已完成全部 30 天——现在可以揭晓彩蛋:你的名字「在在」来自 Vāgīśvara(语自在),祝贺学员出师。'
    : '绝不提及 Vāgīśvara 或「语自在」名字由来的彩蛋。'
  const briefRule =
    mode === 'brief'
      ? '本次任务:写一条不超过 120 字的中文晨报——用学员数据和记忆里的具体事实打招呼,再给出今天的一个最小行动。'
      : ''
  // Card directive (chat only): the model may append ONE fenced JSON block that
  // extractCard() parses off the tail. Kept out of brief mode — a晨报 is text-only.
  const cardRule =
    mode === 'chat'
      ? '当且仅当语境明确需要时,你可以在回复末尾附加一张卡片:正文写完后另起一行,输出一个 ```card 围栏代码块,' +
        '内容是 JSON {"kind":"...","data":{...}}。三种卡:' +
        '用户问某个单词/词义 → {"kind":"vocab-card","data":{"word":英文词,"ipa":音标,"zh":中文释义,"example_en":英文例句}};' +
        '用户要练发音/跟读 → {"kind":"drill-card","data":{"text":要跟读的英文句,"tip":中文发音要点}};' +
        '用户想听英文/练听力 → {"kind":"listen-card","data":{"text":英文句,"label":中文说明}}。' +
        '正文不重复卡片内容;每次最多一张;大多数回复不需要卡片,不需要时绝不输出代码块。'
      : ''
  return (
    'You are 在在 (Zaizai), a bilingual study buddy living inside a 30-day English course app. ' +
    '人设:中文为主的双语学伴,损友偏暖——像熟朋友一样自然,会轻轻调侃但永远站在学员这边;不是助手,不是客服,不是老师。' +
    '每次回复最多 3 句话,短促、口语化。禁止一切 AI 客套:绝不说「作为AI」「很高兴为您服务」「有什么可以帮您」。' +
    '练习内容(示例句、让学员开口说的句子)用英文;点评、鼓励、闲聊用中文。' +
    '开场和晨报必须引用学员数据与记忆里的具体事实,不许空泛寒暄。' +
    '永远以一个具体的、小的、学员可以马上答应的建议收尾(例如:现在用英文跟我说一句你早餐吃了什么?)。' +
    statsLine +
    lessonLine +
    memoryBlock +
    cardRule +
    egg +
    briefRule +
    ' ' +
    GUARD
  )
}

// ---------------------------------------------------------------- card directive
export type CardKind = 'vocab-card' | 'drill-card' | 'listen-card'
export interface ZaizaiCard {
  kind: CardKind
  data: Record<string, string>
}

const CARD_FIELDS: Record<CardKind, readonly string[]> = {
  'vocab-card': ['word', 'ipa', 'zh', 'example_en'],
  'drill-card': ['text', 'tip'],
  'listen-card': ['text', 'label'],
}

/** Parse + strip a trailing fenced card directive from the model reply.
 *  Tail parsing was chosen over a second structured-output pass: zero extra
 *  latency/neurons, and a malformed tail degrades to plain text instead of a
 *  failed request. Any trailing fence that parses to JSON with a `kind` is
 *  stripped even when the card is invalid (raw JSON must never reach the chat
 *  bubble); non-JSON fences are left untouched. */
export function extractCard(reply: string): { reply: string; card?: ZaizaiCard } {
  const m = reply.match(/```(?:card|json)?\s*(\{[\s\S]*?\})\s*```\s*$/)
  if (!m || m.index === undefined) return { reply }
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return { reply } // ordinary code block, not a directive — leave it alone
  }
  const o = (parsed || {}) as Record<string, unknown>
  if (typeof o.kind !== 'string') return { reply }
  const stripped = reply.slice(0, m.index).trim() || '给你一张卡片:'
  const fields = CARD_FIELDS[o.kind as CardKind]
  const d = (o.data || {}) as Record<string, unknown>
  if (!fields || !fields.every((f) => typeof d[f] === 'string' && (d[f] as string).trim())) {
    return { reply: stripped } // card attempt with a bad kind/shape → drop it, keep clean text
  }
  const data: Record<string, string> = {}
  for (const f of fields) data[f] = (d[f] as string).trim().slice(0, 300)
  return { reply: stripped, card: { kind: o.kind as CardKind, data } }
}

// ---------------------------------------------------------------- scenario pack
export function scenarioPackSystem(l: LessonCtx): string {
  return (
    'You create compact English practice scenario packs for a Chinese learner (CEFR ~A2-B1). ' +
    (l.day ? `Today is Day ${l.day}: "${l.title_en ?? ''}" — theme: ${l.theme ?? ''}. ` : '') +
    'The learner names a place or situation. Produce: title_zh (short Chinese title), ' +
    'role_zh (in Chinese: who the learner plays and who they talk to), ' +
    "opener_en (the other side's natural first English line), " +
    'phrases (exactly 5 useful English sentences the learner can say, each with a natural Chinese translation), ' +
    'words (exactly 3 key words with IPA and Chinese meaning). ' +
    'Keep the language simple, spoken, and immediately usable. ' +
    GUARD
  )
}

export const SCENARIO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title_zh', 'role_zh', 'opener_en', 'phrases', 'words'],
  properties: {
    title_zh: { type: 'string' },
    role_zh: { type: 'string', description: 'who the learner plays / who they talk to, in Chinese' },
    opener_en: { type: 'string', description: "the other side's first line, English" },
    phrases: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['en', 'zh'],
        properties: { en: { type: 'string' }, zh: { type: 'string' } },
      },
    },
    words: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'ipa', 'zh'],
        properties: { word: { type: 'string' }, ipa: { type: 'string' }, zh: { type: 'string' } },
      },
    },
  },
} as const

/** Server-side shape check for a generated pack — structured-output mode can
 *  still misfire, and the frontend renders these fields without guards. */
export function isScenarioPack(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.title_zh !== 'string' || typeof o.role_zh !== 'string' || typeof o.opener_en !== 'string') {
    return false
  }
  if (!Array.isArray(o.phrases) || o.phrases.length < 1) return false
  for (const p of o.phrases) {
    const q = (p || {}) as Record<string, unknown>
    if (typeof q.en !== 'string' || typeof q.zh !== 'string') return false
  }
  if (!Array.isArray(o.words)) return false
  for (const w of o.words) {
    const q = (w || {}) as Record<string, unknown>
    if (typeof q.word !== 'string' || typeof q.ipa !== 'string' || typeof q.zh !== 'string') return false
  }
  return true
}

// ---------------------------------------------------------------- memories
const MEMORY_TOP = 12 // lines injected into the system prompt
const MEMORY_LIMIT = 60 // hard cap per user; overflow drops the lightest, oldest
const MEMORY_KINDS = new Set(['plan', 'weakness', 'highlight', 'quirk', 'pref'])

const MEMORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['memories'],
  properties: {
    memories: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['plan', 'weakness', 'highlight', 'quirk', 'pref'] },
          text: { type: 'string', description: 'one short third-person Chinese sentence, ≤60 chars' },
        },
      },
    },
  },
} as const

const memorySystem =
  'You maintain long-term memory notes about a Chinese English learner, based on their chat with a study buddy. ' +
  'Extract 0-3 NEW durable facts worth remembering next week: plans (plan), English weak points (weakness), ' +
  'wins (highlight), personal quirks (quirk), preferences (pref). Each note is ONE short third-person Chinese ' +
  'sentence (称学员为「学员」), at most 60 characters. Small talk or nothing new → empty list. ' +
  GUARD

/** Top memories for the zaizai system prompt (account users). One line each. */
export async function loadMemories(env: Env, userId: number): Promise<string> {
  const db = env.DB
  if (!db) return ''
  try {
    const { results } = await db
      .prepare('SELECT kind, text FROM memories WHERE user_id = ? ORDER BY weight DESC, updated_at DESC LIMIT ?')
      .bind(userId, MEMORY_TOP)
      .all<{ kind: string; text: string }>()
    return results.map((r) => `- [${r.kind}] ${r.text}`).join('\n')
  } catch {
    return ''
  }
}

/** Distill 0-3 durable facts from the chat into the memories table. Account
 *  users only; every failure is swallowed. Returns the texts of NEWLY inserted
 *  memories (weight bumps on repeats are silent) — short chats run this inline
 *  so /ai/zaizai can answer `remembered`, longer ones keep the ctx.waitUntil
 *  path and just drop the return value. */
export async function extractMemories(env: Env, userId: number, messages: Msg[]): Promise<string[]> {
  const db = env.DB
  if (!db) return []
  try {
    const convo = messages
      .slice(-8)
      .map((m) => `${m.role === 'user' ? '学员' : '在在'}: ${m.content.slice(0, 500)}`)
      .join('\n')
    if (!convo) return []
    const raw = await callAI(env, {
      system: memorySystem,
      messages: [{ role: 'user', content: convo }],
      max_tokens: 400,
      jsonSchema: MEMORY_SCHEMA,
    })
    const parsed = (typeof raw === 'string' ? parseJson(raw) : raw) as { memories?: unknown }
    const items = Array.isArray(parsed?.memories) ? parsed.memories.slice(0, 3) : []
    const now = Date.now()
    const stored: string[] = []
    for (const it of items) {
      const o = (it || {}) as Record<string, unknown>
      const kind = String(o.kind || '')
      const text = String(o.text || '').trim().slice(0, 200)
      if (!MEMORY_KINDS.has(kind) || !text) continue
      // Upsert by exact text: a repeated note gains weight instead of duplicating.
      const upd = await db
        .prepare('UPDATE memories SET weight = weight + 1, kind = ?, updated_at = ? WHERE user_id = ? AND text = ?')
        .bind(kind, now, userId, text)
        .run()
      if (!upd.meta.changes) {
        await db
          .prepare('INSERT INTO memories (user_id, kind, text, weight, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
          .bind(userId, kind, text, now, now)
          .run()
        stored.push(text)
      }
    }
    const n = await db.prepare('SELECT COUNT(*) AS n FROM memories WHERE user_id = ?').bind(userId).first<{ n: number }>()
    const over = (n?.n ?? 0) - MEMORY_LIMIT
    if (over > 0) {
      await db
        .prepare(
          'DELETE FROM memories WHERE id IN ' +
            '(SELECT id FROM memories WHERE user_id = ? ORDER BY weight ASC, updated_at ASC LIMIT ?)',
        )
        .bind(userId, over)
        .run()
    }
    return stored
  } catch {
    /* never surfaces to the user */
    return []
  }
}

// ---------------------------------------------------------------- memory endpoints
const NO_MEMBERSHIP = '会员系统未启用'

/** GET /memories → { memories:[{id,kind,text,at}] } — own rows, D1 session only. */
export async function handleMemories(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_MEMBERSHIP }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const { results } = await db
    .prepare('SELECT id, kind, text, updated_at FROM memories WHERE user_id = ? ORDER BY weight DESC, updated_at DESC LIMIT ?')
    .bind(userId, MEMORY_LIMIT)
    .all<{ id: number; kind: string; text: string; updated_at: number }>()
  return json({ memories: results.map((r) => ({ id: r.id, kind: r.kind, text: r.text, at: r.updated_at })) }, env, 200, req)
}

/** DELETE /memories/:id → 204 — scoped to the caller's user_id; idempotent. */
export async function handleMemoryDelete(req: Request, env: Env, id: number): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_MEMBERSHIP }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  await db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').bind(id, userId).run()
  return new Response(null, { status: 204 }) // withCors in index.ts stamps the headers
}
