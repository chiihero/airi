import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { memoryRepo } from '../database/repos/memory.repo'
import { createMemuClient, MemuError } from '../libs/memory/memu'
import { useSettingsMemu } from '../stores/settings/memu'

/**
 * Reactive view of the memory prompt assembled from the most recent retrieval.
 *
 * Updated by {@link refreshMemoryForPrompt} whenever a new user message arrives,
 * and read by the chat orchestrator's system-prompt supplement so the LLM sees
 * recalled context without any context-message plumbing.
 */
const recalledMemoryPrompt = ref('')

/**
 * 结构子集，本地 `MemoryEntry` 与 memU `MemuMemory` 都满足它，使
 * {@link formatMemories} 一条路径即可格式化两个来源的结果。
 */
interface FormattableMemory {
  userText: string
  assistantText: string
  createdAt: number
}

/**
 * Extract candidate search keywords from a user message.
 *
 * Strategy: split on whitespace/punctuation, drop stopwords and very short
 * tokens, keep the longest few. This is intentionally lightweight — it powers a
 * keyword-contains match, not semantic search, so precision matters more than
 * recall. Local-only by design (no embedding model download).
 *
 * 仅在本地关键词检索路径使用；memU 向量检索路径不需要关键词。
 */
function extractKeywords(text: string, max = 6): string[] {
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'me',
    'him',
    'her',
    'us',
    'them',
    'my',
    'your',
    '这',
    '那',
    '的',
    '了',
    '是',
    '在',
    '我',
    '你',
    '他',
    '她',
    '它',
    '和',
    '与',
    '吗',
    '呢',
    '吧',
    '啊',
    '呀',
  ])
  // Split on non-word characters (covers ASCII + CJK because CJK has no spaces;
  // each Han character becomes its own token, which is fine for keyword match).
  const tokens = text.split(/[\s,.!?;:'"()[\]{}，。！？；：（）【】、]+/).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of tokens) {
    const lowered = token.toLowerCase()
    if (lowered.length < 2)
      continue
    if (stopwords.has(lowered))
      continue
    if (seen.has(lowered))
      continue
    seen.add(lowered)
    out.push(lowered)
    if (out.length >= max)
      break
  }
  return out
}

function formatMemories(entries: FormattableMemory[]): string {
  if (entries.length === 0)
    return ''
  const lines = entries.map((entry, idx) => {
    const date = new Date(entry.createdAt).toLocaleDateString()
    return `[${idx + 1}] (${date}) You: ${entry.userText}\n    Companion: ${entry.assistantText}`
  })
  return lines.join('\n')
}

/**
 * Read the current memU settings as refs. Called per-turn so changes in the
 * settings page take effect on the very next message without a reload.
 */
function readMemuConfig() {
  const store = useSettingsMemu()
  return storeToRefs(store)
}

/**
 * Retrieve memories relevant to the user's message and refresh the shared
 * prompt fragment. Call this from the chat orchestrator's `onBeforeSend` hook
 * so the LLM sees recalled context for the upcoming turn.
 *
 * 当 memU 启用时走向量检索（完全替代本地）；当 memU 未启用或调用失败时，
 * 行为按"完全替代"策略处理：
 * - 未启用：回退到本地 IndexedDB 关键词匹配（个人精简版默认离线模式）。
 * - 启用但调用失败：清空本轮记忆提示，让对话在无记忆下继续，不静默回退
 *   本地。这是用户明确选择的策略 —— 一旦启用 memU，本地 store 即被视为
 *   过期/不再写入，因此失败时宁可"无记忆"也不混入可能陈旧的本地数据。
 *   失败原因以 warn 形式落到控制台，供排查 memU 服务连通性。
 */
async function refreshMemoryForPrompt(userText: string, _sessionId?: string): Promise<void> {
  if (!userText.trim()) {
    recalledMemoryPrompt.value = ''
    return
  }

  let entries: FormattableMemory[]

  const { enabled, baseUrl, token } = readMemuConfig()
  if (enabled.value) {
    try {
      const client = createMemuClient({ baseUrl: baseUrl.value, token: token.value || undefined })
      const { memories } = await client.retrieve({ query: userText, topK: 5 })
      entries = memories
    }
    catch (error) {
      // NOTICE: memU retrieve 失败时按"完全替代"策略清空记忆提示，不回退本地
      // memoryRepo。原因是启用 memU 后本地 store 不再写入，数据会逐渐陈旧，
      // 混入会误导 LLM。控制台 warn 保留 kind 便于区分网络/鉴权/超时。
      if (error instanceof MemuError)
        console.warn(`[memu] retrieve failed (${error.kind}): ${error.message}`)
      else
        console.warn('[memu] retrieve failed:', error)
      recalledMemoryPrompt.value = ''
      return
    }
  }
  else {
    const keywords = extractKeywords(userText)
    entries = await memoryRepo.search(keywords, 5)
  }

  const block = formatMemories(entries)
  recalledMemoryPrompt.value = block
    ? `You have the following memories of past conversations with the user. Use them to stay consistent and reference prior context naturally, but do not repeat them verbatim:\n\n${block}`
    : ''
}

/**
 * Persist a completed exchange as a memory entry. Call this from the chat
 * orchestrator's `onChatTurnComplete` hook. Truncates overly long exchanges to
 * keep the store lean.
 *
 * 当 memU 启用时走 memU 持久化（完全替代本地）；未启用时写本地 IndexedDB。
 * memU 写入失败时静默丢弃 —— 记忆 I/O 是 fire-and-forget 旁路，绝不能
 * 阻断或污染 LLM 流式回复。一次丢失的可接受代价远小于卡死对话轮。
 */
async function memorizeExchange(userText: string, assistantText: string, sessionId?: string): Promise<void> {
  if (!userText.trim() || !assistantText.trim())
    return
  // NOTICE: cap stored text length so a single verbose turn cannot bloat the
  // memory store. 1000 chars each is enough to preserve topical context.
  const maxLen = 1000
  const userTextCapped = userText.slice(0, maxLen)
  const assistantTextCapped = assistantText.slice(0, maxLen)

  const { enabled, baseUrl, token } = readMemuConfig()
  if (enabled.value) {
    try {
      const client = createMemuClient({ baseUrl: baseUrl.value, token: token.value || undefined })
      await client.memorize({ userText: userTextCapped, assistantText: assistantTextCapped, sessionId })
    }
    catch (error) {
      if (error instanceof MemuError)
        console.warn(`[memu] memorize failed (${error.kind}): ${error.message}`)
      else
        console.warn('[memu] memorize failed:', error)
    }
    return
  }

  const id = generateLocalId()
  await memoryRepo.add({
    id,
    userText: userTextCapped,
    assistantText: assistantTextCapped,
    createdAt: Date.now(),
    sessionId,
  })
}

// Small local id generator to avoid pulling nanoid into the composable's hot
// path; collision probability over a capped 500-entry store is negligible.
function generateLocalId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function useMemory() {
  return {
    recalledMemoryPrompt,
    refreshMemoryForPrompt,
    memorizeExchange,
  }
}
