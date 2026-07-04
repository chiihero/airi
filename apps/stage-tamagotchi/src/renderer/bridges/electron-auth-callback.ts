import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { toast } from 'vue-sonner'

import {
  electronAuthCallback,
  electronAuthCallbackError,
} from '../../shared/eventa'

/**
 * Register auth callback listeners at the renderer service level so they
 * persist for the window's lifetime, independent of any Vue component's
 * mount/unmount lifecycle.
 *
 * In the slim build the main process forwards the static token it received
 * from the token-entry prompt (no OIDC exchange, no refresh token). The
 * renderer persists it and lets fetchSession resolve the identity.
 */
export function initializeElectronAuthCallbackBridge() {
  const context = getElectronEventaContext()

  context.on(electronAuthCallback, async (event) => {
    const tokens = event.body
    if (!tokens)
      return

    try {
      const authStore = useAuthStore()
      authStore.setStaticToken(tokens.accessToken)
      await fetchSession()
    }
    catch (error) {
      toast.error(errorMessageFrom(error) ?? 'Sign-in failed')
    }
  })

  context.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
}
