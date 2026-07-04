import type { MiddlewareHandler } from 'hono'

import type { Env } from '../libs/env'
import type { HonoEnv } from '../types/hono'

import { resolveRequestAuth } from '../libs/request-auth'
import { createUnauthorizedError } from '../utils/error'

/**
 * Session middleware injects the user and session into the Hono context.
 * It does not block unauthorized requests — pair with {@link authGuard} on
 * routes that require a principal.
 *
 * Resolves the principal purely from the static bearer token; there is no
 * better-auth session lookup, so no path prefix needs to be skipped for perf.
 */
export function sessionMiddleware(env: Env): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const session = await resolveRequestAuth(env, c.req.raw.headers)

    if (!session) {
      c.set('user', null)
      c.set('session', null)
      return await next()
    }

    c.set('user', session.user)
    c.set('session', session.session)
    await next()
  }
}

/**
 * Auth guard middleware blocks requests if the user is not authenticated.
 * Must be used after sessionMiddleware.
 */
export const authGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const user = c.get('user')
  if (!user) {
    throw createUnauthorizedError()
  }
  await next()
}
