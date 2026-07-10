import { json, type Env } from './index'
import { readSession } from './session'

// Stripe Checkout scaffold — self-serve paid membership. GATED on STRIPE_SECRET_KEY:
// without it, /pay/checkout → 503 and /health payment=false (the app falls back
// to activation codes). Membership is granted by the SAME rule as code redemption
// (membership.ts:handleActivate): member_until = MAX(now, current) + days, so a
// purchase stacks onto whatever the user already has.
//
// Setup (user, when ready): create Products/Prices in Stripe, then
//   wrangler secret put STRIPE_SECRET_KEY
//   wrangler secret put STRIPE_WEBHOOK_SECRET
// and set STRIPE_PRICE_MONTH / _QUARTER / _YEAR (price IDs) in wrangler.toml vars.
// Point a Stripe webhook at /pay/webhook for checkout.session.completed.

interface Plan { days: number; priceEnv: 'STRIPE_PRICE_MONTH' | 'STRIPE_PRICE_QUARTER' | 'STRIPE_PRICE_YEAR'; label: string }
const PLANS: Record<string, Plan> = {
  month: { days: 31, priceEnv: 'STRIPE_PRICE_MONTH', label: '月度会员' },
  quarter: { days: 93, priceEnv: 'STRIPE_PRICE_QUARTER', label: '季度会员' },
  year: { days: 366, priceEnv: 'STRIPE_PRICE_YEAR', label: '年度会员' },
}

/** True when in-app card payment is configured. */
export function payEnabled(env: Env): boolean {
  return !!env.STRIPE_SECRET_KEY
}

/** Which plans actually have a price wired (for the pricing UI). */
export function availablePlans(env: Env): string[] {
  return Object.entries(PLANS)
    .filter(([, p]) => !!env[p.priceEnv])
    .map(([k]) => k)
}

/** POST /pay/checkout {plan} → { url } — a Stripe Checkout page to redirect to. */
export async function handleCheckout(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return json({ error: '在线支付未开启' }, env, 503, req)
  // Real D1 account required — payment must attach to a durable identity we can
  // extend later (a passcode/anon session has no user row).
  const uid = await readSession(req, env)
  if (uid === null) return json({ error: '请先注册或登录账号' }, env, 401, req)

  const body = (await req.json().catch(() => ({}))) as { plan?: string }
  const plan = PLANS[body.plan || 'year']
  if (!plan) return json({ error: '套餐无效' }, env, 400, req)
  const price = env[plan.priceEnv]
  if (!price) return json({ error: '该套餐暂未开放' }, env, 503, req)

  const origin = new URL(req.url).origin
  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('line_items[0][price]', price)
  form.set('line_items[0][quantity]', '1')
  form.set('client_reference_id', String(uid))
  form.set('metadata[uid]', String(uid))
  form.set('metadata[days]', String(plan.days))
  form.set('success_url', `${origin}/?pay=success`)
  form.set('cancel_url', `${origin}/?pay=cancel`)

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } }
    if (!res.ok || !data.url) return json({ error: data.error?.message || '创建支付失败' }, env, 502, req)
    return json({ url: data.url }, env, 200, req)
  } catch {
    return json({ error: '创建支付失败' }, env, 502, req)
  }
}

/** POST /pay/webhook — Stripe → us. Verify signature, grant membership on paid. */
export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return new Response('not configured', { status: 503 })
  const sig = req.headers.get('stripe-signature') || ''
  const raw = await req.text()
  if (!(await verifyStripeSig(raw, sig, env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('bad signature', { status: 400 })
  }
  let event: {
    id?: string
    type?: string
    data?: { object?: { client_reference_id?: string; metadata?: Record<string, string>; payment_status?: string; id?: string } }
  }
  try { event = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  if (event.type === 'checkout.session.completed' && env.DB) {
    const s = event.data?.object || {}
    // Only fulfill a PAID session — delayed-notification methods (SEPA/ACH/…)
    // can fire 'completed' with payment_status:'unpaid' before funds settle.
    if (s.payment_status && s.payment_status !== 'paid') return new Response('ok (unpaid)', { status: 200 })
    const eventId = String(event.id || s.id || '')
    const uid = Number(s.client_reference_id || s.metadata?.uid || '')
    const days = Number(s.metadata?.days || '0')
    const valid = Number.isFinite(uid) && uid > 0 && days > 0
    const now = Date.now()
    const add = days * 86_400_000
    // Same accumulation rule as activation-code redemption (membership.ts).
    if (eventId) {
      // Idempotency claim + grant in ONE db.batch() transaction: the users
      // UPDATE only fires when THIS delivery inserted the event row (EXISTS on
      // id + this call's timestamp). Stripe delivers at-least-once (retries up
      // to ~3 days); a redelivery finds changes===0 on the claim and the guarded
      // grant self-skips — a single payment can never stack N× the days, and a
      // crash between the two writes can't leave the event claimed but ungranted.
      const stmts = [
        env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, at) VALUES (?, ?)').bind(eventId, now),
      ]
      if (valid) {
        stmts.push(
          env.DB.prepare(
            'UPDATE users SET member_until = MAX(?1, COALESCE(member_until, 0)) + ?2 ' +
              'WHERE id = ?3 AND EXISTS (SELECT 1 FROM stripe_events WHERE id = ?4 AND at = ?1)',
          ).bind(now, add, uid, eventId),
        )
      }
      const [claim] = await env.DB.batch(stmts)
      if (!claim.meta.changes) return new Response('ok (duplicate)', { status: 200 })
    } else if (valid) {
      // No event id to claim → grant unguarded (same behavior as before).
      await env.DB.prepare('UPDATE users SET member_until = MAX(?1, COALESCE(member_until, 0)) + ?2 WHERE id = ?3')
        .bind(now, add, uid)
        .run()
    }
  }
  return new Response('ok', { status: 200 })
}

// Verify a Stripe-Signature header: `t=<ts>,v1=<hex hmac of "ts.payload">`.
async function verifyStripeSig(payload: string, header: string, secret: string): Promise<boolean> {
  let t = '', v1 = ''
  for (const part of header.split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i)
    const val = part.slice(i + 1)
    if (k === 't') t = val
    else if (k === 'v1' && !v1) v1 = val
  }
  if (!t || !v1) return false
  // Freshness: reject signatures outside a 5-minute window (replay protection,
  // matching Stripe's default tolerance).
  const age = Math.abs(Date.now() / 1000 - Number(t))
  if (!Number.isFinite(age) || age > 300) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i)
  return diff === 0
}
