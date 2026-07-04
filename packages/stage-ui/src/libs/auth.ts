import { useAuthStore } from '../stores/auth'
import { SERVER_URL } from './server'

// NOTICE: reads the same localStorage key ('auth/v1/token') that useAuthStore's
// `token` ref writes via useLocalStorage. We bypass the store here because
// auth helpers may run at module scope, before Pinia is active — calling
// useAuthStore() at that point would throw. The two stay in sync because
// useLocalStorage and raw localStorage share the same underlying storage entry.
export function getAuthToken(): string | null {
  return localStorage.getItem('auth/v1/token')
}

let initialized = false

/**
 * Restore the authenticated identity from the persisted static token.
 *
 * In the slim build there is no OIDC refresh scheduling — the token does not
 * expire, so initialization simply asks the server to resolve the principal
 * from the Bearer header. The server's `/api/auth/get-session` endpoint
 * (a lightweight handler backed by the static-token resolver) returns the
 * synthesized user/session envelope when the token matches `TEST_AUTH_TOKEN`.
 */
export async function initializeAuth() {
  if (initialized)
    return
  initialized = true

  await fetchSession().catch(() => {})
}

/**
 * Resolve the user/session envelope from the server using the persisted static
 * token, and write it into the auth store so `isAuthenticated` flips true.
 *
 * When the server is unreachable (offline personal use — the chat history is
 * local-first), the call fails silently and the synthesized identity set by
 * `setStaticToken()` remains in place, so the renderer stays usable offline.
 * Only an explicit 401 from the server (token mismatch) clears local state.
 *
 * Returns true when the server enriched the identity, false otherwise.
 */
export async function fetchSession(): Promise<boolean> {
  const token = getAuthToken()
  if (!token) {
    return false
  }

  try {
    const res = await fetch(new URL('/api/auth/get-session', SERVER_URL).toString(), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    })
    if (res.status === 401) {
      // Token explicitly rejected by the server — clear so the UI re-prompts.
      useAuthStore().clearAllAuthState()
      return false
    }
    if (!res.ok) {
      // Non-401 error: leave the synthesized local identity intact.
      return false
    }
    const data = await res.json() as { user?: unknown, session?: unknown }
    const authStore = useAuthStore()
    if (data.user && data.session) {
      authStore.user = data.user as Record<string, unknown>
      authStore.session = data.session as Record<string, unknown>
      return true
    }
    return false
  }
  catch {
    // Network failure / server not running: keep the local identity so the
    // renderer is usable offline.
    return false
  }
}

/**
 * Sign out by clearing local auth state. There is no server-side session row to
 * revoke in the static-token model, so this is purely a local operation.
 */
export async function signOut(): Promise<void> {
  useAuthStore().clearAllAuthState()
}
