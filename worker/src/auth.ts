import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose'
import type { Env } from './index'

// Verify a Supabase access token (Authorization: Bearer <jwt>).
// Supports both auth schemes:
//   - Legacy HS256 shared secret (SUPABASE_JWT_SECRET set)
//   - Default asymmetric signing keys (verified via the project JWKS endpoint)
// Returns the user id (sub) on success, or null on any failure.

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(supabaseUrl: string) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`
  let jwks = jwksCache.get(url)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url))
    jwksCache.set(url, jwks)
  }
  return jwks
}

export async function verifyUser(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null

  try {
    let payload: JWTPayload
    if (env.SUPABASE_JWT_SECRET) {
      const key = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
      ;({ payload } = await jwtVerify(token, key, { algorithms: ['HS256'] }))
    } else if (env.SUPABASE_URL) {
      ;({ payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL)))
    } else {
      return null
    }
    // Supabase puts the user id in `sub`; require an authenticated (non-anon) role.
    if (payload.role === 'anon') return null
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
