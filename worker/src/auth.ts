import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Env } from './index'
import { readSession } from './session'

// Verify a Cloudflare Access identity. When the Worker route is protected by a
// Zero Trust Access application, Cloudflare validates the login at the edge and
// forwards a signed JWT in the `Cf-Access-Jwt-Assertion` header. We re-verify it
// (defense in depth) against the team's public keys and return the user's email.
//
// Local dev: set DEV_BYPASS_AUTH=true in .dev.vars so `wrangler dev` works
// without a real Access tenant.

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(teamDomain: string) {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`
  let jwks = jwksCache.get(url)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url))
    jwksCache.set(url, jwks)
  }
  return jwks
}

export interface Identity {
  uid: string // quota key: 'u:{id}' account, email (Access), 'member', or an IP
  member: boolean // member tier → full daily quotas; free tier → FREE_* caps
  name: string // display name for /me
}

/** Resolve the caller's identity + tier. Checked in order: dev bypass → account
 *  session (D1) → shared passcode / open mode → Cloudflare Access JWT. */
export async function identify(request: Request, env: Env): Promise<Identity | null> {
  if (env.DEV_BYPASS_AUTH === 'true') return { uid: 'dev@local', member: true, name: 'dev' }

  // Account session cookie (only meaningful once the D1 membership DB is bound).
  if (env.DB && env.SESSION_SECRET) {
    const id = await readSession(request, env)
    if (id !== null) {
      const row = await env.DB
        .prepare('SELECT id, username, member_until FROM users WHERE id = ?')
        .bind(id)
        .first<{ id: number; username: string; member_until: number | null }>()
      if (row) {
        return { uid: `u:${row.id}`, member: (row.member_until ?? 0) > Date.now(), name: row.username }
      }
    }
  }

  // No Cloudflare Access configured → open / passcode mode (no dashboard needed).
  if (!env.CF_ACCESS_TEAM_DOMAIN) {
    // If a shared passcode is set, require it (header or cookie). This is a
    // simple access gate that needs zero dashboard setup.
    if (env.APP_PASSCODE) {
      const given =
        request.headers.get('x-app-passcode') ||
        (request.headers.get('cookie') || '').match(/app_pc=([^;]+)/)?.[1] ||
        ''
      return given && given === env.APP_PASSCODE ? { uid: 'member', member: true, name: 'owner' } : null
    }
    // Fully open: identify by IP so the per-IP daily quota still bounds abuse.
    // Without D1 this is the only tier → keep today's full quota (member). Once
    // D1 is bound, anonymous visitors drop to the free tier.
    const ip = request.headers.get('CF-Connecting-IP') || 'anon'
    return { uid: ip, member: !env.DB, name: '访客' }
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    // fallback: the CF_Authorization cookie carries the same JWT
    (request.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1] ||
    ''
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getJwks(env.CF_ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
      audience: env.CF_ACCESS_AUD || undefined,
      algorithms: ['RS256'],
    })
    const who = typeof payload.email === 'string' ? payload.email : (payload.sub as string) || null
    return who ? { uid: who, member: true, name: who } : null
  } catch {
    return null
  }
}

/** Legacy shape — thin wrapper so older call sites keep compiling. */
export async function verifyUser(request: Request, env: Env): Promise<string | null> {
  const id = await identify(request, env)
  return id ? id.uid : null
}
