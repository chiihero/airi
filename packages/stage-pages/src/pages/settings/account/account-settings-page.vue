<script setup lang="ts">
import { signOut } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  login: []
  logout: []
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, token } = storeToRefs(authStore)

const userName = computed(() => (user.value?.name as string | undefined) ?? '')
const userEmail = computed(() => (user.value?.email as string | undefined) ?? null)

// Static-token entry. In the slim build this is the only "credential" — the
// user pastes the same value the server sets as TEST_AUTH_TOKEN. We bind to a
// local ref so the persisted token is not mutated until the user explicitly
// saves.
const tokenDraft = ref(token.value ?? '')
const tokenSaved = ref(false)

async function handleSaveToken() {
  const trimmed = tokenDraft.value.trim()
  if (!trimmed)
    return
  authStore.setStaticToken(trimmed)
  // fetchSession will reconcile user/session from the server on the next mount;
  // here we just persist the token and acknowledge.
  tokenSaved.value = true
}

async function handleLogout() {
  await signOut()
  tokenDraft.value = ''
  emit('logout')
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'p-4']">
    <template v-if="isAuthenticated">
      <div :class="['flex flex-col gap-6 max-w-md']">
        <!-- Identity summary -->
        <section :class="['flex flex-col gap-3 pb-6 border-b border-neutral-200/70 dark:border-neutral-800/60']">
          <div :class="['flex items-center gap-4 py-2']">
            <div :class="['size-16 rounded-full overflow-hidden flex-shrink-0', 'bg-neutral-100 dark:bg-neutral-800', 'flex items-center justify-center']">
              <div :class="['i-solar:user-circle-bold-duotone', 'size-10 text-neutral-400']" />
            </div>
            <div :class="['flex flex-col gap-0.5 min-w-0']">
              <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.signedInAs') }}
              </span>
              <h2 :class="['text-lg font-semibold truncate']">
                {{ userName || t('settings.pages.account.profile.name.placeholder') }}
              </h2>
              <p
                v-if="userEmail"
                :class="['text-sm text-neutral-500 dark:text-neutral-400 truncate']"
              >
                {{ userEmail }}
              </p>
            </div>
          </div>
        </section>

        <!-- Static token management -->
        <section :class="['flex flex-col gap-4 py-2']">
          <header :class="['flex flex-col gap-1']">
            <h3 :class="['text-lg font-semibold']">
              {{ t('settings.pages.account.profile.title') }}
            </h3>
            <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.account.profile.description') }}
            </p>
          </header>

          <form :class="['flex flex-col gap-3']" @submit.prevent="handleSaveToken">
            <FieldInput
              v-model="tokenDraft"
              type="password"
              label="Access Token"
              placeholder="paste the server's TEST_AUTH_TOKEN"
              autocomplete="off"
            />
            <div
              v-if="tokenSaved"
              :class="['text-sm text-green-600 dark:text-green-400']"
              role="status"
              aria-live="polite"
            >
              Token saved.
            </div>
            <div :class="['flex justify-start']">
              <Button
                type="submit"
                :disabled="!tokenDraft.trim() || tokenDraft.trim() === token"
                :label="t('settings.pages.account.profile.action.save')"
              />
            </div>
          </form>
        </section>

        <!-- Sign out -->
        <section :class="['flex flex-col gap-4 py-6 border-t border-neutral-200/70 dark:border-neutral-800/60']">
          <Button
            variant="secondary"
            :label="t('settings.pages.account.logout')"
            @click="handleLogout"
          />
        </section>
      </div>
    </template>

    <template v-else>
      <div :class="['flex flex-col items-center gap-6', 'rounded-xl p-8', 'bg-neutral-50 dark:bg-neutral-900']">
        <div :class="['i-solar:user-circle-bold-duotone', 'size-16 text-neutral-300 dark:text-neutral-600']" />
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400', 'text-center max-w-xs']">
          {{ t('settings.pages.account.notLoggedIn') }}
        </p>
        <button
          :class="[
            'rounded-lg py-2.5 px-6',
            'text-sm font-medium',
            'text-white',
            'bg-primary-500 hover:bg-primary-600',
            'transition-colors cursor-pointer',
          ]"
          @click="emit('login')"
        >
          {{ t('settings.pages.account.login') }}
        </button>
      </div>
    </template>
  </div>
</template>
