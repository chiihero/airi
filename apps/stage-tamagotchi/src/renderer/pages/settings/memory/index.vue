<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { createMemuClient, MemuError } from '@proj-airi/stage-ui/libs/memory/memu'
import { useSettingsMemu } from '@proj-airi/stage-ui/stores/settings'
import { Button, Callout, FieldCheckbox, FieldInput, Input } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memuSettings = useSettingsMemu()
const { enabled, baseUrl, token } = storeToRefs(memuSettings)

const tokenVisible = shallowRef(false)
const tokenInputType = computed(() => tokenVisible.value ? 'text' : 'password')

const testing = shallowRef(false)
const testResult = shallowRef<{ ok: boolean, message: string } | null>(null)

const modeLabel = computed(() => enabled.value
  ? t('settings.pages.memory.mode.memu')
  : t('settings.pages.memory.mode.local'))

async function runConnectionTest() {
  testing.value = true
  testResult.value = null
  try {
    const client = createMemuClient({ baseUrl: baseUrl.value, token: token.value || undefined })
    await client.health()
    testResult.value = { ok: true, message: t('settings.pages.memory.test.success') }
  }
  catch (error) {
    const message = error instanceof MemuError
      ? `${error.kind}: ${error.message}`
      : (errorMessageFrom(error) ?? 'Unknown error')
    testResult.value = { ok: false, message }
  }
  finally {
    testing.value = false
  }
}
</script>

<template>
  <div flex="~ col" gap-6>
    <!-- 记忆体功能说明 -->
    <Callout :label="t('settings.pages.memory.intro.title')">
      {{ t('settings.pages.memory.intro.description') }}
    </Callout>

    <!-- 当前模式指示 -->
    <div :class="['flex', 'flex-col', 'gap-1']">
      <div :class="['text-sm', 'font-medium']">
        {{ t('settings.pages.memory.mode.label') }}
      </div>
      <div :class="['flex', 'items-center', 'gap-2', 'text-sm']">
        <span
          :class="[
            'inline-block',
            'size-2',
            'rounded-full',
            enabled ? 'bg-green-500' : 'bg-neutral-400',
          ]"
        />
        <span>{{ modeLabel }}</span>
      </div>
      <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ enabled
          ? t('settings.pages.memory.mode.memu-hint')
          : t('settings.pages.memory.mode.local-hint') }}
      </div>
    </div>

    <!-- 启用 memU 开关 -->
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.memory.enable.label')"
      :description="t('settings.pages.memory.enable.description')"
    />

    <!-- memU 服务配置（启用后展示） -->
    <template v-if="enabled">
      <FieldInput
        v-model="baseUrl"
        :label="t('settings.pages.memory.base-url.label')"
        :description="t('settings.pages.memory.base-url.description')"
        placeholder="http://localhost:8765"
      />

      <div :class="['flex', 'flex-col', 'gap-2']">
        <div :class="['flex', 'items-center', 'justify-between']">
          <div :class="['text-sm', 'font-medium']">
            {{ t('settings.pages.memory.token.label') }}
          </div>
          <Button
            type="button"
            variant="secondary-muted"
            size="sm"
            shape="square"
            :icon="tokenVisible ? 'i-solar:eye-closed-bold-duotone' : 'i-solar:eye-bold-duotone'"
            :aria-label="tokenVisible ? 'Hide token' : 'Show token'"
            @click="tokenVisible = !tokenVisible"
          />
        </div>
        <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ t('settings.pages.memory.token.description') }}
        </div>
        <Input
          v-model="token"
          :type="tokenInputType"
          :placeholder="t('settings.pages.memory.token.placeholder')"
        />
      </div>

      <!-- 连接测试 -->
      <div :class="['flex', 'flex-col', 'gap-2']">
        <div :class="['flex', 'items-center', 'gap-2']">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            :disabled="testing"
            :icon="testing ? 'i-solar:refresh-bold-duotone' : 'i-solar:plain-bold-duotone'"
            data-testid="memu-test-connection"
            @click="runConnectionTest"
          >
            {{ testing ? t('settings.pages.memory.test.testing') : t('settings.pages.memory.test.action') }}
          </Button>
        </div>
        <Callout
          v-if="testResult"
          :theme="testResult.ok ? 'lime' : 'orange'"
          :label="testResult.ok
            ? t('settings.pages.memory.test.success')
            : t('settings.pages.memory.test.failure')"
        >
          {{ testResult.message }}
        </Callout>
      </div>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:brain-bold-duotone
  settingsEntry: true
  order: 9
  stageTransition:
    name: slide
</route>
