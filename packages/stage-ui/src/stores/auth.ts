import { StorageSerializers, useLocalStorage, whenever } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

/**
 * Auth store — holds identity state for the single personal user.
 *
 * Auth is the static bearer token: the renderer writes `auth/v1/token` with the
 * same value the server configures as `TEST_AUTH_TOKEN`, and the shared
 * `fetchSession()` call resolves the user/session envelope from the server's
 * `/api/auth/get-session` endpoint. There is no OIDC refresh scheduling, no
 * flux/credits balance, and no login-redirect gate — those were removed with
 * the better-auth/stripe modules.
 *
 * This store has no dependency on `stores/providers`, so `providers` can safely
 * depend on it without creating a circular import.
 */
export const useAuthStore = defineStore('auth', () => {
  // NOTICE: user/session are kept as opaque objects — the server synthesizes
  // their shape in resolveTestAuthToken and the renderer only forwards them.
  // Keeping `unknown` here would force awkward casts at every read site, so we
  // accept a loose record and trust the server contract.
  const user = useLocalStorage<Record<string, unknown> | null>('auth/v1/user', null, {
    // Why: https://github.com/vueuse/vueuse/pull/614#issuecomment-875450160
    serializer: StorageSerializers.object,
  })
  const session = useLocalStorage<Record<string, unknown> | null>('auth/v1/session', null, { serializer: StorageSerializers.object })
  const token = useLocalStorage<string | null>('auth/v1/token', null)
  const isAuthenticated = computed(() => !!user.value && !!session.value)
  const userId = computed(() => (user.value?.id as string | undefined) ?? 'local')

  // Cross-app "user must log in" flag. With static-token auth the only way to
  // satisfy this is to set the token, so consumers prompt for token entry
  // rather than an OIDC redirect. Kept so existing call sites compile.
  const needsLogin = ref(false)

  whenever(needsLogin, () => {
    // No automatic OIDC redirect in the slim build — the UI layer is expected
    // to surface a token-entry prompt. This is a no-op fallback so the flag
    // does not spin a loop.
  })

  // --- Lifecycle hooks ---
  type AuthHook = () => void | Promise<void>
  const authenticatedHooks: AuthHook[] = []
  const logoutHooks: AuthHook[] = []

  function onAuthenticated(hook: AuthHook) {
    authenticatedHooks.push(hook)
    // If already authenticated when hook is registered, fire immediately.
    if (isAuthenticated.value) {
      hook()
    }
    return () => {
      const idx = authenticatedHooks.indexOf(hook)
      if (idx >= 0)
        authenticatedHooks.splice(idx, 1)
    }
  }

  function onLogout(hook: AuthHook) {
    logoutHooks.push(hook)
    return () => {
      const idx = logoutHooks.indexOf(hook)
      if (idx >= 0)
        logoutHooks.splice(idx, 1)
    }
  }

  // Dispatch hooks when auth state changes
  watch(isAuthenticated, async (val, oldVal) => {
    if (val && !oldVal) {
      needsLogin.value = false
      for (const hook of authenticatedHooks) {
        try {
          await hook()
        }
        catch (e) {
          console.error('auth hook error', e)
        }
      }
    }
    if (!val && oldVal) {
      for (const hook of logoutHooks) {
        try {
          await hook()
        }
        catch (e) {
          console.error('logout hook error', e)
        }
      }
    }
  })

  /**
   * Reset every auth-related field atomically. Call on sign-out or when the
   * server rejects the token.
   */
  function clearAllAuthState(): void {
    user.value = null
    session.value = null
    token.value = null
  }

  /**
   * Persist a static bearer token and mark the session as authenticated.
   *
   * In the personal build the renderer may run without the API server (the
   * chat history is local-first via IndexedDB), so we synthesize a minimal
   * user/session envelope from the token rather than blocking on
   * `/api/auth/get-session`. When the server is reachable, `fetchSession()`
   * (called on mount) enriches these with the server-side fields; when it is
   * not, the synthesized identity is enough for `isAuthenticated` and the
   * `userId` derivation to work offline.
   */
  function setStaticToken(value: string): void {
    token.value = value
    user.value = { id: 'local-user', name: 'You' }
    session.value = { id: 'static', token: value, userId: 'local-user' }
    needsLogin.value = false
  }

  return {
    user,
    userId,
    session,
    token,
    isAuthenticated,
    needsLogin,
    onAuthenticated,
    onLogout,
    clearAllAuthState,
    setStaticToken,
  }
})
