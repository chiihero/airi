/**
 * memU 记忆服务前端 client。
 *
 * memU 是 AIRI 个人精简版的向量记忆服务（独立部署的 Python FastAPI 进程，
 * 见 personal-slim-handoff.md 阶段 6）。本模块是前端对接它的 HTTP client，
 * 同时定义了前后端共享的请求/响应契约 —— 后端 `services/memu-memory/`
 * 必须按此契约实现以下三个端点：
 *
 * - `POST /memorize`  持久化一次对话交换
 * - `POST /retrieve`  按语义相似度召回相关记忆
 * - `GET  /health`    存活探测，供设置页做连接测试
 *
 * 契约刻意与本地 IndexedDB 的 {@link MemoryEntry} 形状对齐
 * （`userText` / `assistantText` / `createdAt` / `sessionId`），这样
 * `useMemory` 的 `formatMemories` 既能格式化本地结果，也能直接格式化
 * memU 结果，无需两套渲染路径。
 *
 * 所有方法在网络或服务端错误时抛出 `MemuError`，调用方
 * （`useMemory` 与设置页连接测试）负责捕获降级，保证记忆 I/O 永不
 * 阻断 LLM 流式回复。
 */

import { errorMessageFrom } from '@moeru/std'

/** memU client 调用过程中抛出的错误，携带可向用户展示的分类信息。 */
export class MemuError extends Error {
  /** 粗分类，供 UI 决定提示措辞（网络不可达 vs 鉴权失败 vs 服务端错误）。 */
  readonly kind: 'network' | 'auth' | 'server' | 'timeout'

  constructor(kind: MemuError['kind'], message: string) {
    super(message)
    this.name = 'MemuError'
    this.kind = kind
  }
}

/** 单条记忆条目，形状与本地 `MemoryEntry` 对齐以便共用格式化逻辑。 */
export interface MemuMemory {
  userText: string
  assistantText: string
  /** Unix 毫秒时间戳。 */
  createdAt: number
  /** 相似度分数（0–1，越高越相关），服务端可选返回。 */
  score?: number
}

/** `POST /memorize` 请求体。 */
export interface MemuMemorizeRequest {
  userText: string
  assistantText: string
  sessionId?: string
}

/** `POST /memorize` 响应体。 */
export interface MemuMemorizeResponse {
  /** 服务端为该条记忆分配的稳定 id。 */
  id: string
}

/** `POST /retrieve` 请求体。 */
export interface MemuRetrieveRequest {
  query: string
  /** 想要召回的条数上限，服务端可 clamp。 */
  topK?: number
}

/** `POST /retrieve` 响应体。 */
export interface MemuRetrieveResponse {
  memories: MemuMemory[]
}

/** `GET /health` 响应体。 */
export interface MemuHealthResponse {
  status: string
}

/**
 * 归一化 memU 服务基地址：去除尾部斜杠，确保拼接路径时不会出现双斜杠。
 *
 * Before:
 * - "http://localhost:8765/"
 *
 * After:
 * - "http://localhost:8765"
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/**
 * 带超时的 fetch 包装。memU 调用都是 fire-and-forget 语义（绝不阻塞 LLM
 * 流），因此每条调用都必须有明确超时，避免服务端卡住时把记忆管线挂死。
 *
 * 超时统一映射为 `MemuError { kind: 'timeout' }`，让调用方能按超时单独
 * 降级（例如 retrieve 超时时回退为"无记忆"而非整轮报错）。
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new MemuError('timeout', `memU request timed out after ${timeoutMs}ms`)
    // 其余 TypeError（网络层不可达 / DNS 失败 / CORS）一律归为 network。
    throw new MemuError('network', `memU request failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
  finally {
    clearTimeout(timer)
  }
}

/** 将非 2xx 响应映射为带分类的 `MemuError`。 */
async function throwForStatus(response: Response): Promise<void> {
  if (response.ok)
    return
  const body = await response.text().catch(() => '')
  if (response.status === 401 || response.status === 403)
    throw new MemuError('auth', `memU rejected credentials (${response.status})`)
  throw new MemuError('server', `memU responded ${response.status}: ${body.slice(0, 200)}`)
}

export interface MemuClientOptions {
  /** memU 服务基地址，例如 `http://localhost:8765`。 */
  baseUrl: string
  /** 可选 Bearer 令牌，注入 `Authorization` 头。 */
  token?: string
}

/** 创建绑定到特定服务地址与凭据的 memU client。 */
export function createMemuClient(options: MemuClientOptions) {
  const base = normalizeBaseUrl(options.baseUrl)

  function buildHeaders(extra?: HeadersInit): Headers {
    const headers = new Headers(extra)
    headers.set('Content-Type', 'application/json')
    if (options.token)
      headers.set('Authorization', `Bearer ${options.token}`)
    return headers
  }

  return {
    /**
     * 持久化一次完成的对话交换。对应 `POST /memorize`。
     *
     * 超时 8s：写入是异步旁路，慢一点可接受，但不能无限挂起。
     */
    async memorize(payload: MemuMemorizeRequest, timeoutMs = 8_000): Promise<MemuMemorizeResponse> {
      const response = await fetchWithTimeout(`${base}/memorize`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        credentials: 'omit',
      }, timeoutMs)
      await throwForStatus(response)
      return (await response.json()) as MemuMemorizeResponse
    },

    /**
     * 按语义相似度召回相关记忆。对应 `POST /retrieve`。
     *
     * 超时 5s：retrieve 跑在 `onBeforeSend` 钩子里，必须在 LLM 请求发出
     * 前完成，超时比 memorize 更紧以保证对话延迟可控。
     */
    async retrieve(payload: MemuRetrieveRequest, timeoutMs = 5_000): Promise<MemuRetrieveResponse> {
      const response = await fetchWithTimeout(`${base}/retrieve`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        credentials: 'omit',
      }, timeoutMs)
      await throwForStatus(response)
      return (await response.json()) as MemuRetrieveResponse
    },

    /**
     * 存活探测，供设置页"测试连接"按钮使用。对应 `GET /health`。
     *
     * 超时 3s：用户在等待结果，必须快速反馈。
     */
    async health(timeoutMs = 3_000): Promise<MemuHealthResponse> {
      const response = await fetchWithTimeout(`${base}/health`, {
        method: 'GET',
        headers: buildHeaders(),
        credentials: 'omit',
      }, timeoutMs)
      await throwForStatus(response)
      return (await response.json()) as MemuHealthResponse
    },
  }
}

export type MemuClient = ReturnType<typeof createMemuClient>
