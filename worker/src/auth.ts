import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Env } from './index'

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

export async function verifyUser(request: Request, env: Env): Promise<string | null> {
  if (env.DEV_BYPASS_AUTH === 'true') return 'dev@local'

  // Open mode: no Access configured → allow everyone, identify by IP so the
  // per-IP daily quota still bounds abuse (no login, no dashboard needed).
  if (!env.CF_ACCESS_TEAM_DOMAIN) {
    return request.headers.get('CF-Connecting-IP') || 'anon'
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
    return typeof payload.email === 'string' ? payload.email : (payload.sub as string) || null
  } catch {
    return null
  }
}
