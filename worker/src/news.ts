import { json, callAI, parseJson, bump, type Env } from './index'
import { GUARD } from './prompts'

// GET /ai/news (v3.2) — today's study-news card. Three layers, so the endpoint
// NEVER 502s (the tile always renders a 200 card):
//   1. VOA Learning English feed → AI-simplified to A2-B1 (source: VOA)
//   2. feed unreachable → the AI writes a news-style A2-B1 short read on the
//      day's topic — the real 「今日话题」 fallback (source: 每日话题)
//   3. AI down too → a built-in static card for the weekday (never cached, so
//      a later request retries the AI path within the same day)
// AI-generated cards are cached in KV under news:{UTC date} (TTL 26h) so one
// model call serves every user; handleNews only reads the cache and generates
// on a miss, and both daily crons prefetch it (scheduled() in index.ts).
//
// Feed notes (probed 2026-07): the /z/1689 page is HTML and /api/zrqiteuuir is
// an empty RSS channel; the item-bearing feed is "As It Is" (the daily news
// program), so it leads the list.
const FEEDS = [
  'https://learningenglish.voanews.com/api/zkm-ql-vomx-tpej-rqi', // As It Is (news, has items)
  'https://learningenglish.voanews.com/api/zrqiteuuir', // site self-feed (empty at probe time)
]

// VOA's CDN answers some datacenter user agents with hangs/errors — send a
// browser-like UA (contents are public; this is compatibility, not evasion).
const FEED_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Cap ALL external text before it reaches a prompt.
const TITLE_CAP = 300
const DESC_CAP = 1500

const NEWS_TTL = 26 * 3600 // seconds — a bit over a day, so the next cron refresh overlaps
const newsKey = () => `news:${new Date().toISOString().slice(0, 10)}` // UTC on purpose: shared global cache key

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

export interface NewsCard {
  title: string
  level: string
  summary_en: string
  glossary: { word: string; zh: string }[]
  source: string
}

// Daily-topic rotation for the AI fallback (indexed by UTC weekday, Sun=0).
const TOPICS = ['daily life', 'food and cooking', 'travel', 'technology', 'health', 'nature and animals', 'work and study']

// Layer 3 — hand-written A2-B1 cards, one per UTC weekday (same rotation as
// TOPICS). Served only when BOTH the feed and Workers AI fail; never cached,
// so the very next request retries the real generation.
const STATIC_CARDS: NewsCard[] = [
  {
    title: 'Morning Routines Around the World',
    level: 'A2-B1',
    summary_en:
      'How do people start their day? In many countries, people wake up early and eat a small breakfast. Some exercise or read the news. In China, many older people do morning exercises in the park. In Spain, breakfast is often just coffee and bread. Scientists say a calm morning routine helps you feel good all day. What is your morning routine?',
    glossary: [
      { word: 'routine', zh: '日常习惯' },
      { word: 'exercise', zh: '锻炼' },
      { word: 'calm', zh: '平静的' },
      { word: 'scientist', zh: '科学家' },
      { word: 'wake up', zh: '醒来' },
    ],
    source: '每日话题',
  },
  {
    title: 'Why People Love Street Food',
    level: 'A2-B1',
    summary_en:
      'Street food is popular all over the world. It is fast, cheap, and full of flavor. In Thailand, people eat noodles from small carts. In Mexico, tacos are a favorite street snack. Street food also helps travelers learn about local culture. Cooks often use family recipes that are many years old. Next time you travel, try some street food!',
    glossary: [
      { word: 'flavor', zh: '风味' },
      { word: 'cart', zh: '小推车' },
      { word: 'snack', zh: '小吃' },
      { word: 'culture', zh: '文化' },
      { word: 'recipe', zh: '食谱' },
    ],
    source: '每日话题',
  },
  {
    title: 'Traveling Light: Less Is More',
    level: 'A2-B1',
    summary_en:
      'Many travelers now pack only one small bag. This is called traveling light. A small bag saves time at the airport and money on fees. Experts say you should choose clothes that match each other. Roll your clothes to save space. Traveling light also means less stress — you can move fast and enjoy the trip more.',
    glossary: [
      { word: 'pack', zh: '打包' },
      { word: 'fee', zh: '费用' },
      { word: 'expert', zh: '专家' },
      { word: 'match', zh: '搭配' },
      { word: 'stress', zh: '压力' },
    ],
    source: '每日话题',
  },
  {
    title: 'Smartphones Change How We Learn',
    level: 'A2-B1',
    summary_en:
      'Today, many people learn new things on their phones. Apps can teach languages, math, and even cooking. Short lessons are easy to finish on a bus or during lunch. Teachers say phones help students practice every day. But experts also warn: too much screen time is bad for sleep. The best plan is short, regular study time.',
    glossary: [
      { word: 'app', zh: '应用程序' },
      { word: 'lesson', zh: '课程' },
      { word: 'practice', zh: '练习' },
      { word: 'screen', zh: '屏幕' },
      { word: 'regular', zh: '有规律的' },
    ],
    source: '每日话题',
  },
  {
    title: 'Walking: Simple Exercise, Big Benefits',
    level: 'A2-B1',
    summary_en:
      'Walking is one of the easiest ways to stay healthy. Doctors say thirty minutes of walking each day is good for your heart. Walking can also help you sleep better and feel happier. You do not need special clothes or a gym. Many people walk with friends, so it is social time too. Start small: take the stairs today!',
    glossary: [
      { word: 'benefit', zh: '益处' },
      { word: 'heart', zh: '心脏' },
      { word: 'gym', zh: '健身房' },
      { word: 'social', zh: '社交的' },
      { word: 'stairs', zh: '楼梯' },
    ],
    source: '每日话题',
  },
  {
    title: 'Bees: Small Insects with a Big Job',
    level: 'A2-B1',
    summary_en:
      'Bees are very important for our food. They carry pollen from flower to flower, which helps plants grow fruit and seeds. One out of three bites of food comes from plants that bees help. But bee numbers are falling in many countries. People can help by planting flowers and using fewer chemicals. Small actions protect these hard workers.',
    glossary: [
      { word: 'bee', zh: '蜜蜂' },
      { word: 'pollen', zh: '花粉' },
      { word: 'seed', zh: '种子' },
      { word: 'chemical', zh: '化学品' },
      { word: 'protect', zh: '保护' },
    ],
    source: '每日话题',
  },
  {
    title: 'The Power of Short Breaks',
    level: 'A2-B1',
    summary_en:
      'Do you study or work for hours without stopping? Research shows short breaks make you work better. After about fifty minutes, your brain gets tired. A five-minute break helps you focus again. Stand up, drink water, or look out the window. Some people use a timer to remember their breaks. Rest is part of good work!',
    glossary: [
      { word: 'break', zh: '休息' },
      { word: 'research', zh: '研究' },
      { word: 'brain', zh: '大脑' },
      { word: 'focus', zh: '集中注意力' },
      { word: 'timer', zh: '计时器' },
    ],
    source: '每日话题',
  },
]

/** Layers 1+2+3. `fromAI: true` marks a fresh model generation (cacheable +
 *  charges the caller's quota); `false` is the static card (free, uncached). */
async function generateNews(env: Env): Promise<{ card: NewsCard; fromAI: boolean }> {
  let item: { title: string; description: string } | null = null
  for (const url of FEEDS) {
    // VOA hangs from some CF colos (connection opens, response never comes) —
    // an unbounded fetch here dangles the client request. 5s per feed, hard.
    const r = await fetch(url, {
      headers: { accept: 'application/rss+xml, text/xml', 'user-agent': FEED_UA },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null)
    if (!r?.ok) continue
    item = firstItem(await r.text())
    if (item) break
  }
  // No reachable feed → self-contained daily topic (varied by weekday) so the
  // card never depends on an external host being reachable from this colo.
  const fromFeed = !!item
  if (!item) item = { title: TOPICS[new Date().getUTCDay()], description: '' }
  try {
    const raw = await callAI(env, {
      system:
        (fromFeed
          ? 'You turn one VOA Learning English news item into study material for a Chinese learner. '
          : 'You write one short, interesting news-style everyday-knowledge read for a Chinese English learner on the given topic. ') +
        'Produce: title (simple English headline), summary_en (at most 80 words, CEFR A2-B1 vocabulary, short ' +
        'sentences; if the description is empty, write a brief factual A2-B1 introduction to the topic named in ' +
        'the title), glossary (exactly 5 useful English words from the material, each with a concise Chinese ' +
        'meaning). ' +
        GUARD,
      messages: [{ role: 'user', content: `Title: ${item.title}\n\nDescription: ${item.description || '(empty)'}` }],
      max_tokens: 600,
      jsonSchema: NEWS_SCHEMA,
    })
    const parsed = typeof raw === 'string' ? parseJson(raw) : raw
    if (!isNewsGen(parsed)) throw new Error('bad news shape')
    const card: NewsCard = {
      title: parsed.title.trim().slice(0, 200),
      level: 'A2-B1',
      summary_en: parsed.summary_en.trim().slice(0, 900),
      glossary: parsed.glossary.slice(0, 5).map((g) => ({ word: g.word.slice(0, 60), zh: g.zh.slice(0, 120) })),
      source: fromFeed ? 'VOA Learning English' : '每日话题',
    }
    return { card, fromAI: true }
  } catch {
    // Model down / bad shape → static weekday card. NOT cached: a retry later
    // the same day gets another shot at the real generation.
    return { card: STATIC_CARDS[new Date().getUTCDay()], fromAI: false }
  }
}

/** Cron prefetch (both daily crons call this via scheduled()): fill the KV
 *  cache for today so the first user of the day never waits on feed + model. */
export async function prefetchNews(env: Env): Promise<void> {
  try {
    const key = newsKey()
    if (await env.QUOTA.get(key)) return
    const { card, fromAI } = await generateNews(env)
    if (fromAI) await env.QUOTA.put(key, JSON.stringify(card), { expirationTtl: NEWS_TTL })
  } catch (e) {
    console.error('prefetchNews:', e) // prefetch is best-effort — requests self-heal on miss
  }
}

/** Hosted inside handleAI (identify + q-quota already applied). Reads the KV
 *  cache; a miss generates in-request and writes back. The quota is only bumped
 *  on a fresh AI generation — cache hits and the static fallback cost nothing.
 *  ALWAYS answers a 200 card. */
export async function handleNews(req: Request, env: Env, uid: string): Promise<Response> {
  const key = newsKey()
  try {
    const cached = await env.QUOTA.get(key)
    if (cached) return json(JSON.parse(cached), env, 200, req)
  } catch {
    /* corrupt cache entry → regenerate */
  }
  const { card, fromAI } = await generateNews(env)
  if (fromAI) {
    try {
      await bump(env, 'q', uid) // charge on a successful model call
      await env.QUOTA.put(key, JSON.stringify(card), { expirationTtl: NEWS_TTL })
    } catch {
      /* quota/cache bookkeeping is best-effort — never blocks the card */
    }
  }
  return json(card, env, 200, req)
}
