import type { AuthSession, AuthUser } from '../types/hono'
import type { Env } from './env'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

export interface RequestAuthSession {
  user: AuthUser
  session: AuthSession
}

/**
 * Whether a user is currently banned, honoring `banExpires`.
 *
 * The static-token resolver always synthesizes `banned: false`, so this is
 * effectively a no-op in the personal build. Kept so `resolveRequestAuth`
 * preserves the ban-gate contract that downstream code may still reference.
 */
export function isUserBannedNow(user: { banned?: boolean | null, banExpires?: Date | string | null }): boolean {
  if (!user.banned)
    return false
  if (user.banExpires == null)
    return true
  return new Date(user.banExpires).getTime() > Date.now()
}

function readBearerToken(headers: Headers): string | null {
  const authorization = headers.get('authorization')
  if (!authorization?.startsWith('Bearer '))
    return null

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Resolve a synthetic user/session from a static bearer token.
 *
 * This is the single authentication path in the personal slim build. The token
 * is compared against `env.TEST_AUTH_TOKEN` with a constant-time equality, and
 * on match a virtual user/session envelope is returned — no database lookup,
 * no OIDC, no JWT verification. A mismatch or missing token yields `null`.
 */
function resolveStaticToken(env: Env, accessToken: string): RequestAuthSession | null {
  if (!env.TEST_AUTH_TOKEN || !timingSafeStringEqual(accessToken, env.TEST_AUTH_TOKEN))
    return null

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)
  const role = env.TEST_AUTH_USER_ROLE.trim()

  return {
    user: {
      id: env.TEST_AUTH_USER_ID,
      email: env.TEST_AUTH_USER_EMAIL.toLowerCase(),
      name: env.TEST_AUTH_USER_NAME,
      emailVerified: true,
      image: null,
      role: role || null,
      banned: false,
      banReason: null,
      banExpires: null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: `static-auth:${env.TEST_AUTH_USER_ID}`,
      token: accessToken,
      userId: env.TEST_AUTH_USER_ID,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      ipAddress: null,
      userAgent: null,
    },
  }
}

/**
 * Resolve a session from request headers WITHOUT applying the ban gate.
 *
 * Kept for callers that want the verified principal but make their own ban
 * decision. In the personal build the ban gate is inert (synthesized users are
 * never banned), but the contract is preserved.
 */
export async function resolveSessionIgnoringBan(
  env: Env,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const accessToken = readBearerToken(headers)
  if (!accessToken)
    return null

  return resolveStaticToken(env, accessToken)
}

/**
 * Resolve the request principal and apply the ban gate. This is what
 * `sessionMiddleware` calls on every request to populate `c.get('user')`.
 */
export async function resolveRequestAuth(
  env: Env,
  headers: Headers,
): Promise<RequestAuthSession | null> {
  const resolved = await resolveSessionIgnoringBan(env, headers)
  if (!resolved)
    return null

  if (isUserBannedNow(resolved.user))
    return null

  return resolved
}
