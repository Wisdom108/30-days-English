import { json, type Env } from './index'
import { readSession } from './session'

// Earned-seconds economy (D1): learning earns call seconds, Grok calls spend
// them. Requires a REAL account session (readSession, uid `u:{id}`) — a
// passcode/Access/IP identity has no user row to attach a balance to.
// Idempotency: wallet_ledger.ref is unique per user (partial index), so
// INSERT OR IGNORE with changes=0 means "already claimed" — replays are free.
// Balance changes are single atomic UPDATEs (never read-modify-write).

export const EARN_RULES = {
  block_complete:    { seconds: 120, dailyCap: 5,  refFmt: 'block:{day}:{key}' },
  day_complete:      { seconds: 300, dailyCap: 1,  refFmt: 'day:{day}' },
  scenario_complete: { seconds: 120, dailyCap: 3,  refFmt: 'scenario:{date}:{n}' },
  streak_milestone:  { seconds: 600, dailyCap: 1,  refFmt: 'streak:{n}' }, // n∈{7,14,21,30}
} as const
export type EarnEvent = keyof typeof EARN_RULES
export const GROK_CALL_COST = 300 // 每通电话扣 300 秒
export const BADGES: { id: string; name_zh: string; desc_zh: string; unlock?: string }[] = [
  { id: 'first_call',  name_zh: '初通电话', desc_zh: '完成第一通实时通话' },
  { id: 'streak_7',    name_zh: '七日不断', desc_zh: '连续学习 7 天', unlock: 'voice:rex' },
  { id: 'scenario_3',  name_zh: '场景新手', desc_zh: '完成 3 次场景演练', unlock: 'voice:leo' },
  { id: 'scenario_10', name_zh: '场景老手', desc_zh: '完成 10 次场景演练' },
  { id: 'day_10',      name_zh: '生存毕业', desc_zh: '完成 Day 1–10' },
  { id: 'day_20',      name_zh: '生活自如', desc_zh: '完成 Day 11–20' },
  { id: 'day_30',      name_zh: '出师',     desc_zh: '完成全部 30 天' },
]

// Ref shape per event (mirrors refFmt) — day/n values are range-checked here so
// the client-supplied ref can't smuggle absurd numbers into badges.
const REF_RE: Record<EarnEvent, RegExp> = {
  block_complete: /^block:([1-9]|[12]\d|30):[\w-]{1,24}$/,
  day_complete: /^day:([1-9]|[12]\d|30)$/,
  scenario_complete: /^scenario:\d{4}-\d{2}-\d{2}:[1-9]\d{0,2}$/,
  streak_milestone: /^streak:(7|14|21|30)$/,
}

const NO_WALLET = '额度钱包未启用'

// ---------------------------------------------------------------- helpers (grok.ts)
/** Atomically spend `seconds` from the wallet. The UPDATE's balance guard is the
 *  gate — changes=1 means charged (+ ledger row). Any failure → false, no charge. */
export async function spendWallet(env: Env, userId: number, seconds: number): Promise<boolean> {
  const db = env.DB
  if (!db) return false
  try {
    const now = Date.now()
    const r = await db
      .prepare(
        'UPDATE wallet SET balance_seconds = balance_seconds - ?1, updated_at = ?2 ' +
          'WHERE user_id = ?3 AND balance_seconds >= ?1',
      )
      .bind(seconds, now, userId)
      .run()
    if (!r.meta.changes) return false
    await db
      .prepare('INSERT INTO wallet_ledger (user_id, delta_seconds, reason, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, -seconds, 'spend:grok_call', now)
      .run()
    return true
  } catch {
    return false
  }
}

/** Give a charge back (upstream mint failed after spendWallet). Best-effort. */
export async function refundWallet(env: Env, userId: number, seconds: number): Promise<void> {
  const db = env.DB
  if (!db) return
  try {
    const now = Date.now()
    await db
      .prepare('UPDATE wallet SET balance_seconds = balance_seconds + ?1, updated_at = ?2 WHERE user_id = ?3')
      .bind(seconds, now, userId)
      .run()
    await db
      .prepare('INSERT INTO wallet_ledger (user_id, delta_seconds, reason, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, seconds, 'refund:grok_call', now)
      .run()
  } catch {
    /* refund is best-effort — never blocks the caller's error path */
  }
}

/** Grant a badge (INSERT OR IGNORE). True only when it's newly earned. */
export async function grantBadge(env: Env, userId: number, badgeId: string): Promise<boolean> {
  const db = env.DB
  if (!db) return false
  try {
    const r = await db
      .prepare('INSERT OR IGNORE INTO badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)')
      .bind(userId, badgeId, Date.now())
      .run()
    return !!r.meta.changes
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- handlers
/** GET /wallet → { balanceSeconds, badges, ledger[≤20], rules, callCost }. */
export async function handleWallet(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_WALLET }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const bal = await db
    .prepare('SELECT balance_seconds FROM wallet WHERE user_id = ?')
    .bind(userId)
    .first<{ balance_seconds: number }>()
  const badges = (
    await db.prepare('SELECT badge_id FROM badges WHERE user_id = ? ORDER BY earned_at').bind(userId).all<{ badge_id: string }>()
  ).results.map((r) => r.badge_id)
  const ledger = (
    await db
      .prepare('SELECT delta_seconds, reason, created_at FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .bind(userId)
      .all<{ delta_seconds: number; reason: string; created_at: number }>()
  ).results.map((r) => ({ delta: r.delta_seconds, reason: r.reason, at: r.created_at }))
  const rules = Object.fromEntries(
    Object.entries(EARN_RULES).map(([k, v]) => [k, { seconds: v.seconds, dailyCap: v.dailyCap }]),
  )
  return json({ balanceSeconds: bal?.balance_seconds ?? 0, badges, ledger, rules, callCost: GROK_CALL_COST }, env, 200, req)
}

/** POST /earn {event, ref, meta?} → { balanceSeconds, earned, newBadges }.
 *  Replayed ref or a hit daily cap → earned:0 (not an error — clients fire-and-forget). */
export async function handleEarn(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_WALLET }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventStr = String(body.event || '')
  const ref = String(body.ref || '')
  if (!(eventStr in EARN_RULES)) return json({ error: '无效的奖励事件' }, env, 400, req)
  const event = eventStr as EarnEvent
  const rule = EARN_RULES[event]
  if (!REF_RE[event].test(ref)) return json({ error: '无效的奖励事件' }, env, 400, req)

  const now = Date.now()
  const reason = `earn:${event}`
  // Daily cap: count today's claims of this event in the ledger (UTC day, same
  // boundary as the KV quotas).
  const dayStart = new Date(now).setUTCHours(0, 0, 0, 0)
  const claimed = await db
    .prepare('SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = ? AND reason = ? AND created_at >= ?')
    .bind(userId, reason, dayStart)
    .first<{ n: number }>()
  let earned = 0
  if ((claimed?.n ?? 0) < rule.dailyCap) {
    const ins = await db
      .prepare('INSERT OR IGNORE INTO wallet_ledger (user_id, delta_seconds, reason, ref, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, rule.seconds, reason, ref, now)
      .run()
    if (ins.meta.changes) {
      earned = rule.seconds
      await db
        .prepare(
          'INSERT INTO wallet (user_id, balance_seconds, updated_at) VALUES (?1, ?2, ?3) ' +
            'ON CONFLICT(user_id) DO UPDATE SET balance_seconds = balance_seconds + ?2, updated_at = ?3',
        )
        .bind(userId, rule.seconds, now)
        .run()
    }
  }

  // Badge judgement — INSERT OR IGNORE keeps this idempotent, so it also runs on
  // replays (covers a badge write that failed on the original claim).
  // first_call is granted on the grok/token spend side.
  const newBadges: string[] = []
  const tryBadge = async (id: string) => {
    if (await grantBadge(env, userId, id)) newBadges.push(id)
  }
  if (event === 'scenario_complete') {
    const total = await db
      .prepare('SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = ? AND reason = ?')
      .bind(userId, reason)
      .first<{ n: number }>()
    const n = total?.n ?? 0
    if (n >= 3) await tryBadge('scenario_3')
    if (n >= 10) await tryBadge('scenario_10')
  } else if (event === 'day_complete') {
    const day = Number(ref.slice(4)) // range-checked by REF_RE (1–30)
    if (day === 10) await tryBadge('day_10')
    if (day === 20) await tryBadge('day_20')
    if (day === 30) await tryBadge('day_30')
  } else if (event === 'streak_milestone') {
    await tryBadge('streak_7') // every milestone n∈{7,14,21,30} implies a 7-day streak
  }

  const bal = await db
    .prepare('SELECT balance_seconds FROM wallet WHERE user_id = ?')
    .bind(userId)
    .first<{ balance_seconds: number }>()
  return json({ balanceSeconds: bal?.balance_seconds ?? 0, earned, newBadges }, env, 200, req)
}
