import { storage } from '../storage'

/**
 * A single conversational memory entry persisted in IndexedDB.
 *
 * Each entry captures one user↔assistant exchange so the companion can recall
 * prior context across reloads and sessions. Retrieval is keyword-based (no
 * embedding model download required), which keeps the personal build fully
 * offline-capable.
 */
export interface MemoryEntry {
  /** Stable id (nanoid). */
  id: string
  /** The user's message text in this exchange. */
  userText: string
  /** The assistant's reply text in this exchange. */
  assistantText: string
  /** Unix ms timestamp of when the exchange completed. */
  createdAt: number
  /** Originating chat session, for optional scoping. */
  sessionId?: string
}

const INDEX_KEY = 'local:memory/index'
const ENTRY_KEY = (id: string) => `local:memory/entries/${id}`

interface MemoryIndex {
  /** Entry ids newest-first, so retrieval can prefer recent context. */
  ids: string[]
}

async function readIndex(): Promise<MemoryIndex> {
  return (await storage.getItemRaw<MemoryIndex>(INDEX_KEY)) ?? { ids: [] }
}

async function writeIndex(index: MemoryIndex): Promise<void> {
  await storage.setItemRaw(INDEX_KEY, index)
}

export const memoryRepo = {
  /**
   * Append a new memory entry and keep the index ordered newest-first.
   * Caps the total count at `maxEntries` by dropping the oldest beyond the cap
   * so IndexedDB does not grow unbounded over long-term use.
   */
  async add(entry: MemoryEntry, maxEntries = 500): Promise<void> {
    await storage.setItemRaw(ENTRY_KEY(entry.id), entry)
    const index = await readIndex()
    // Dedup by id, then prepend so the newest exchange is first.
    index.ids = [entry.id, ...index.ids.filter(id => id !== entry.id)]
    // Trim oldest entries beyond the cap. The index is newest-first, so the
    // tail holds the oldest ids; removing them also deletes their payloads.
    if (index.ids.length > maxEntries) {
      const dropped = index.ids.splice(maxEntries)
      await Promise.all(dropped.map(id => storage.removeItem(ENTRY_KEY(id))))
    }
    await writeIndex(index)
  },

  /**
   * Return up to `limit` memory entries whose user/assistant text contains any
   * of the `keywords` (case-insensitive). When no keywords match, the most
   * recent entries are returned as a fallback so the companion always has some
   * prior context.
   *
   * Results are newest-first.
   */
  async search(keywords: string[], limit = 5): Promise<MemoryEntry[]> {
    const index = await readIndex()
    const lowered = keywords.map(k => k.toLowerCase()).filter(Boolean)
    const matched: MemoryEntry[] = []

    for (const id of index.ids) {
      if (matched.length >= limit)
        break
      const entry = await storage.getItemRaw<MemoryEntry>(ENTRY_KEY(id))
      if (!entry)
        continue
      const haystack = `${entry.userText} ${entry.assistantText}`.toLowerCase()
      if (lowered.length === 0 || lowered.some(kw => haystack.includes(kw)))
        matched.push(entry)
    }

    // Fallback: if nothing matched but we had keywords, surface recent memories
    // so the LLM is not left context-starved.
    if (matched.length === 0 && lowered.length > 0) {
      return await this.recent(limit)
    }

    return matched
  },

  /**
   * Return the `limit` most recent memory entries, newest-first. Used as the
   * no-keyword retrieval path and as the search fallback.
   */
  async recent(limit = 5): Promise<MemoryEntry[]> {
    const index = await readIndex()
    const ids = index.ids.slice(0, limit)
    const entries = await Promise.all(ids.map(id => storage.getItemRaw<MemoryEntry>(ENTRY_KEY(id))))
    return entries.filter((e): e is MemoryEntry => e != null)
  },

  async clear(): Promise<void> {
    const index = await readIndex()
    await Promise.all(index.ids.map(id => storage.removeItem(ENTRY_KEY(id))))
    await writeIndex({ ids: [] })
  },
}
