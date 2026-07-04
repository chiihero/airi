/**
 * Resolved user principal carried on the Hono context.
 *
 * In the personal slim build this is always synthesized by
 * `resolveTestAuthToken` from the single static bearer token — there is no
 * better-auth session row and no OIDC/JWT verification path. The shape mirrors
 * what the retained chats/characters/providers/chat-ws routes read off
 * `c.get('user')` (id, role for optional guards).
 */
export interface AuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: Date | string | null
  lastSeenAt: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Resolved session principal. Like {@link AuthUser}, this is a synthetic
 * envelope produced by the static-token resolver, not a persisted row.
 */
export interface AuthSession {
  id: string
  token: string
  userId: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
}

export interface HonoEnv {
  Variables: {
    user: AuthUser | null
    session: AuthSession | null
  }
}
