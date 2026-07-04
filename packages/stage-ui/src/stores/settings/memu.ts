import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * memU 记忆服务的运行时配置。
 *
 * 这三项由设置页（`settings/memory`）写入，由 `useMemory` 在每次
 * retrieve / memorize 前读取，决定本轮记忆 I/O 是走本地 IndexedDB
 * 关键词匹配，还是走 memU 向量检索。配置用 `useLocalStorageManualReset`
 * 持久化到 localStorage，与其它设置项保持同一存储与重置语义。
 *
 * 当 `enabled` 为 `false`（默认）时，记忆管线维持个人精简版原有的
 * 离线关键词匹配行为；切换为 `true` 后，`useMemory` 会完全改走 memU，
 * 不再读写本地 `memoryRepo`（见 use-memory.ts 的分支说明）。
 */
export const useSettingsMemu = defineStore('settings-memu', () => {
  /** 是否启用 memU 向量记忆。关闭时回退到本地 IndexedDB 关键词匹配。 */
  const enabled = useLocalStorageManualReset<boolean>('settings/memu/enabled', false)

  /**
   * memU 服务基地址。默认指向本机 FastAPI 进程的约定端口；自托管时
   * 可改为远程地址或反向代理入口。
   */
  const baseUrl = useLocalStorageManualReset<string>('settings/memu/base-url', 'http://localhost:8765')

  /**
   * 可选 Bearer 令牌。memU 服务部署在不可信网络时用它鉴权；本机自托管
   * 且无鉴权需求时留空即可。
   */
  const token = useLocalStorageManualReset<string>('settings/memu/token', '')

  function resetState() {
    enabled.reset()
    baseUrl.reset()
    token.reset()
  }

  return {
    enabled,
    baseUrl,
    token,
    resetState,
  }
})
