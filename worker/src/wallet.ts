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
  scenario_complete: { seconds: 120, dailyCap: 3,  refFmt: 'scenario:{date}:{n}' }, // n 由服务端按当日已领次数重建
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
    // The charge has committed — from here on ALWAYS report true, or the caller
    // would hand out a free call for a merely-cosmetic ledger failure.
    try {
      await db
        .prepare('INSERT INTO wallet_ledger (user_id, delta_seconds, reason, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, -seconds, 'spend:grok_call', now)
        .run()
    } catch {
      /* ledger is advisory — the balance UPDATE is the source of truth */
    }
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

/** Grant `n` streak freezes, guarded by a unique ledger ref (delta 0 — the
 *  audit row carries no seconds). Ledger insert + freeze bump run in ONE
 *  db.batch() transaction, and the bump only fires when the ledger row landed
 *  THIS call (EXISTS on ref + this call's timestamp) — so a replayed ref is a
 *  complete no-op: the pair commits together or not at all, nothing to
 *  "self-heal". */
async function grantFreezes(db: D1Database, userId: number, ref: string, n: number): Promise<void> {
  const now = Date.now()
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO wallet_ledger (user_id, delta_seconds, reason, ref, created_at) VALUES (?1, 0, 'grant:freeze', ?2, ?3)",
      )
      .bind(userId, ref, now),
    db
      .prepare(
        'INSERT INTO wallet (user_id, balance_seconds, freezes, updated_at) ' +
          'SELECT ?1, 0, ?2, ?3 ' +
          'WHERE EXISTS (SELECT 1 FROM wallet_ledger WHERE user_id = ?1 AND ref = ?4 AND created_at = ?3) ' +
          'ON CONFLICT(user_id) DO UPDATE SET freezes = freezes + ?2, updated_at = ?3',
      )
      .bind(userId, n, now, ref),
  ])
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
const BLOCK_KEYS = ['listening', 'vocab', 'speaking', 'reading', 'writing'] as const

/** Backfill milestone badges for pre-v3 users from the synced progress blob —
 *  their day/streak milestones predate /earn, so no ledger rows exist. Badges
 *  only: no seconds are minted retroactively. Best-effort (corrupt blob → skip). */
async function backfillBadges(env: Env, db: D1Database, userId: number): Promise<void> {
  try {
    const prog = await db
      .prepare('SELECT data FROM progress WHERE user_id = ?')
      .bind(userId)
      .first<{ data: string }>()
    let streak7 = false
    if (prog?.data) {
      const blob = JSON.parse(prog.data) as Record<string, unknown> | null
      const days = (blob && typeof blob.days === 'object' && blob.days !== null ? blob.days : {}) as Record<
        string,
        { completedBlocks?: Record<string, unknown> }
      >
      const dayComplete = (d: number): boolean => {
        const blocks = days[d]?.completedBlocks
        return (
          !!blocks && typeof blocks === 'object' && BLOCK_KEYS.every((k) => blocks[k] === true)
        )
      }
      const rangeDone = (a: number, b: number): boolean => {
        for (let d = a; d <= b; d++) if (!dayComplete(d)) return false
        return true
      }
      if (rangeDone(1, 10)) await grantBadge(env, userId, 'day_10')
      if (rangeDone(11, 20)) await grantBadge(env, userId, 'day_20')
      if (rangeDone(21, 30)) await grantBadge(env, userId, 'day_30')
      streak7 = typeof blob?.streak === 'number' && blob.streak >= 7
    }
    if (!streak7) {
      const row = await db
        .prepare("SELECT 1 AS x FROM wallet_ledger WHERE user_id = ? AND reason = 'earn:streak_milestone' LIMIT 1")
        .bind(userId)
        .first<{ x: number }>()
      streak7 = !!row
    }
    if (streak7) await grantBadge(env, userId, 'streak_7')
  } catch {
    /* corrupt blob / transient DB error → skip, next GET /wallet retries */
  }
}

/** GET /wallet → { balanceSeconds, freezes, badges, ledger[≤20], rules, callCost }. */
export async function handleWallet(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_WALLET }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  await backfillBadges(env, db, userId) // pre-v3 milestones → badges (see above)
  // Member monthly allowance: +2 freezes per calendar month, landed lazily on
  // the first /wallet of the month. UTC month on purpose — it's an allowance
  // cadence, never a user-facing date; the unique ref makes it exactly-once.
  const u = await db
    .prepare('SELECT member_until FROM users WHERE id = ?')
    .bind(userId)
    .first<{ member_until: number | null }>()
  if ((u?.member_until ?? 0) > Date.now()) {
    await grantFreezes(db, userId, `freezegrant:month:${new Date().toISOString().slice(0, 7)}`, 2)
  }
  const bal = await db
    .prepare('SELECT balance_seconds, freezes FROM wallet WHERE user_id = ?')
    .bind(userId)
    .first<{ balance_seconds: number; freezes: number }>()
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
  return json(
    { balanceSeconds: bal?.balance_seconds ?? 0, freezes: bal?.freezes ?? 0, badges, ledger, rules, callCost: GROK_CALL_COST },
    env, 200, req,
  )
}

/** POST /earn {event, ref, day, meta?} → { balanceSeconds, earned, newBadges }.
 *  `day` is the client's LOCAL date (YYYY-MM-DD) — daily caps are a product
 *  promise about the learner's day, not UTC. Bounded to ±36h of server time so
 *  a fake clock can't stockpile extra days. Replayed ref or a hit daily cap →
 *  earned:0 (not an error — clients fire-and-forget). */
export async function handleEarn(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_WALLET }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventStr = String(body.event || '')
  const ref = String(body.ref || '')
  const day = String(body.day || '')
  if (!(eventStr in EARN_RULES)) return json({ error: '无效的奖励事件' }, env, 400, req)
  const event = eventStr as EarnEvent
  const rule = EARN_RULES[event]
  if (!REF_RE[event].test(ref)) return json({ error: '无效的奖励事件' }, env, 400, req)
  const now = Date.now()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(Math.abs(Date.parse(`${day}T12:00:00Z`) - now) < 36 * 3_600_000)) {
    return json({ error: '无效的日期' }, env, 400, req) // NaN compares false → rejected too
  }

  const reason = `earn:${event}`
  // ONE self-guarding statement: the daily-cap check and the insert share a
  // snapshot, so two concurrent claims can't overshoot the cap (no TOCTOU).
  // A replayed ref hits the unique (user_id, ref) index → changes=0 → earned 0.
  // scenario_complete ignores the client's n (it collides across devices): the
  // ref is rebuilt in SQL as scenario:{day}:{claimedCount+1} from the same
  // count the guard uses — a rare concurrent dupe lands on the unique index.
  const guard = '(SELECT COUNT(*) FROM wallet_ledger WHERE user_id = ?1 AND reason = ?3 AND day = ?4)'
  const ins =
    event === 'scenario_complete'
      ? await db
          .prepare(
            'INSERT OR IGNORE INTO wallet_ledger (user_id, delta_seconds, reason, ref, day, created_at) ' +
              `SELECT ?1, ?2, ?3, 'scenario:' || ?4 || ':' || (${guard} + 1), ?4, ?5 ` +
              `WHERE ${guard} < ?6`,
          )
          .bind(userId, rule.seconds, reason, day, now, rule.dailyCap)
          .run()
      : await db
          .prepare(
            'INSERT OR IGNORE INTO wallet_ledger (user_id, delta_seconds, reason, ref, day, created_at) ' +
              `SELECT ?1, ?2, ?3, ?5, ?4, ?6 WHERE ${guard} < ?7`,
          )
          .bind(userId, rule.seconds, reason, day, ref, now, rule.dailyCap)
          .run()
  let earned = 0
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
    // Every milestone also rides a +1 streak freeze — same idempotent family,
    // so replays only repair a grant that half-failed on the original claim.
    await grantFreezes(db, userId, `freezegrant:${ref}`, 1)
  }

  const bal = await db
    .prepare('SELECT balance_seconds FROM wallet WHERE user_id = ?')
    .bind(userId)
    .first<{ balance_seconds: number }>()
  return json({ balanceSeconds: bal?.balance_seconds ?? 0, earned, newBadges }, env, 200, req)
}

/** POST /streak/freeze-consume {day, missed} → { ok, consumed, freezes }.
 *  Spends one freeze to patch `missed` (a local YYYY-MM-DD strictly before
 *  `day`, at most 8 days back). The 'freezeuse:{missed}' ledger ref is the
 *  idempotency key: a replay answers ok:true, consumed:false with no decrement;
 *  no freezes left → ok:false (200 — a business outcome, not a request error). */
export async function handleFreezeConsume(req: Request, env: Env): Promise<Response> {
  const db = env.DB
  if (!db || !env.SESSION_SECRET) return json({ error: NO_WALLET }, env, 503, req)
  const userId = await readSession(req, env)
  if (userId === null) return json({ error: '需要登录' }, env, 401, req)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const day = String(body.day || '')
  const missed = String(body.missed || '')
  const now = Date.now()
  // `day` bounds like /earn: the client's local date, within ±36h of server time.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(Math.abs(Date.parse(`${day}T12:00:00Z`) - now) < 36 * 3_600_000)) {
    return json({ error: '无效的日期' }, env, 400, req)
  }
  // `missed` must be a real date strictly before `day`, at most 8 days back.
  // An invalid string parses to NaN → gap NaN → both comparisons fail.
  const gap = /^\d{4}-\d{2}-\d{2}$/.test(missed)
    ? (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${missed}T12:00:00Z`)) / 86_400_000
    : NaN
  if (!(gap >= 1 && gap <= 8)) return json({ error: '无效的补签日期' }, env, 400, req)

  const ref = `freezeuse:${missed}`
  const freezesNow = async () =>
    (await db.prepare('SELECT freezes FROM wallet WHERE user_id = ?').bind(userId).first<{ freezes: number }>())
      ?.freezes ?? 0
  const prior = await db
    .prepare('SELECT 1 AS x FROM wallet_ledger WHERE user_id = ? AND ref = ?')
    .bind(userId, ref)
    .first<{ x: number }>()
  if (prior) return json({ ok: true, consumed: false, freezes: await freezesNow() }, env, 200, req)
  // Ledger insert + freeze decrement in ONE db.batch() transaction. The insert
  // only fires while a freeze is available; the decrement only fires when the
  // ledger row landed THIS call (ref + this call's timestamp). A replayed ref
  // that slipped past the check above therefore mutates nothing, and the pair
  // can never land half-applied — no compensating refund path needed.
  const [ins] = await db.batch([
    db
      .prepare(
        'INSERT OR IGNORE INTO wallet_ledger (user_id, delta_seconds, reason, ref, created_at) ' +
          "SELECT ?1, 0, 'freeze:consume', ?2, ?3 " +
          'WHERE (SELECT freezes FROM wallet WHERE user_id = ?1) >= 1',
      )
      .bind(userId, ref, now),
    db
      .prepare(
        'UPDATE wallet SET freezes = freezes - 1, updated_at = ?2 WHERE user_id = ?1 AND freezes >= 1 ' +
          'AND EXISTS (SELECT 1 FROM wallet_ledger WHERE user_id = ?1 AND ref = ?3 AND created_at = ?2)',
      )
      .bind(userId, now, ref),
  ])
  if (!ins.meta.changes) {
    // Nothing inserted: either a concurrent twin claimed the ref first (the
    // missed day IS patched — answer the replay shape) or there was no freeze.
    const twin = await db
      .prepare('SELECT 1 AS x FROM wallet_ledger WHERE user_id = ? AND ref = ?')
      .bind(userId, ref)
      .first<{ x: number }>()
    if (twin) return json({ ok: true, consumed: false, freezes: await freezesNow() }, env, 200, req)
    return json({ ok: false, error: '没有可用的补签卡', freezes: await freezesNow() }, env, 200, req)
  }
  return json({ ok: true, consumed: true, freezes: await freezesNow() }, env, 200, req)
}
