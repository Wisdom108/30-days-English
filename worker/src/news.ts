import { json, callAI, parseJson, bump, type Env } from './index'
import { GUARD } from './prompts'

// GET /ai/news (v3.1) — today's VOA Learning English item simplified to A2-B1
// study material. Cached in the QUOTA KV namespace under news:{UTC date}
// (TTL 6h), so one model call serves every user. Probed 2026-07: the /z/1689
// page is HTML and /api/zrqiteuuir is an empty RSS channel; the item-bearing
// feed is "As It Is" (the daily news program), so it leads the list.
const FEEDS = [
  'https://learningenglish.voanews.com/api/zkm-ql-vomx-tpej-rqi', // As It Is (news, has items)
  'https://learningenglish.voanews.com/api/zrqiteuuir', // site self-feed (empty at probe time)
]

// Cap ALL external text before it reaches a prompt.
const TITLE_CAP = 300
const DESC_CAP = 1500

/** Strip CDATA/tags/entities from an RSS text node. */
function unTag(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Newest item of an RSS feed (VOA feeds are newest-first). */
function firstItem(xml: string): { title: string; description: string } | null {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1]
  if (!item) return null
  const title = unTag(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').slice(0, TITLE_CAP)
  const description = unTag(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').slice(0, DESC_CAP)
  return title ? { title, description } : null
}

const NEWS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary_en', 'glossary'],
  properties: {
    title: { type: 'string', description: 'simple English headline' },
    summary_en: { type: 'string', description: 'at most 80 words, CEFR A2-B1 English' },
    glossary: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'zh'],
        properties: { word: { type: 'string', minLength: 1 }, zh: { type: 'string', minLength: 1 } },
      },
    },
  },
} as const

interface NewsGen {
  title: string
  summary_en: string
  glossary: { word: string; zh: string }[]
}

function isNewsGen(v: unknown): v is NewsGen {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.title !== 'string' || !o.title.trim()) return false
  if (typeof o.summary_en !== 'string' || !o.summary_en.trim()) return false
  if (!Array.isArray(o.glossary) || o.glossary.length < 1) return false
  for (const g of o.glossary) {
    const q = (g || {}) as Record<string, unknown>
    if (typeof q.word !== 'string' || typeof q.zh !== 'string') return false
  }
  return true
}

/** Hosted inside handleAI (identify + q-quota already applied). The quota is
 *  only bumped on a fresh generation — a KV cache hit costs the user nothing. */
export async function handleNews(req: Request, env: Env, uid: string): Promise<Response> {
  const day = new Date().toISOString().slice(0, 10) // UTC on purpose: shared global cache key
  const key = `news:${day}`
  try {
    const cached = await env.QUOTA.get(key)
    if (cached) return json(JSON.parse(cached), env, 200, req)
  } catch {
    /* corrupt cache entry → regenerate */
  }
  try {
    let item: { title: string; description: string } | null = null
    for (const url of FEEDS) {
      const r = await fetch(url, { headers: { accept: 'application/rss+xml, text/xml' } }).catch(() => null)
      if (!r?.ok) continue
      item = firstItem(await r.text())
      if (item) break
    }
    if (!item) throw new Error('no feed item')
    const raw = await callAI(env, {
      system:
        'You turn one VOA Learning English news item into study material for a Chinese learner. ' +
        'Produce: title (simple English headline), summary_en (at most 80 words, CEFR A2-B1 vocabulary, short ' +
        'sentences; if the description is empty, write a brief factual A2-B1 introduction to the topic named in ' +
        'the title), glossary (exactly 5 useful English words from the material, each with a concise Chinese ' +
        'meaning). ' +
        GUARD,
      messages: [{ role: 'user', content: `Title: ${item.title}\n\nDescription: ${item.description || '(empty)'}` }],
      max_tokens: 600,
      jsonSchema: NEWS_SCHEMA,
    })
    await bump(env, 'q', uid) // charge on a successful model call, even if the shape check fails
    const parsed = typeof raw === 'string' ? parseJson(raw) : raw
    if (!isNewsGen(parsed)) throw new Error('bad news shape')
    const out = {
      title: parsed.title.trim().slice(0, 200),
      level: 'A2-B1',
      summary_en: parsed.summary_en.trim().slice(0, 900),
      glossary: parsed.glossary.slice(0, 5).map((g) => ({ word: g.word.slice(0, 60), zh: g.zh.slice(0, 120) })),
      source: 'VOA Learning English',
    }
    await env.QUOTA.put(key, JSON.stringify(out), { expirationTtl: 6 * 3600 })
    return json(out, env, 200, req)
  } catch {
    return json({ error: '今日新闻暂不可用' }, env, 502, req) // 前端回退「今日话题」生成
  }
}
