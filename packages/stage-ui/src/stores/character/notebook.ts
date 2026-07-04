import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { storage } from '../../database/storage'

// NOTICE: notebook persistence keys. The character notebook (notes / diary /
// focus entries + scheduled tasks) is persisted to IndexedDB so it survives
// reloads. Previously this store was a dead in-memory ref that lost everything
// on refresh; the watch-based persistence below captures every mutation.
const ENTRIES_KEY = 'local:notebook/entries'
const TASKS_KEY = 'local:notebook/tasks'

export type NotebookEntryKind = 'note' | 'diary' | 'focus'

export interface NotebookEntry {
  id: string
  kind: NotebookEntryKind
  text: string
  createdAt: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'
export type TaskStatus = 'queued' | 'scheduled' | 'done' | 'dropped'

export interface ScheduledTask {
  id: string
  title: string
  details?: string
  priority: TaskPriority
  status: TaskStatus
  dueAt?: number
  createdAt: number
  updatedAt: number
  lastNotifiedAt?: number
  nextNotifyAt?: number
  metadata?: Record<string, unknown>
}

export const useCharacterNotebookStore = defineStore('character-notebook', () => {
  const entries = ref<NotebookEntry[]>([])
  const tasks = ref<ScheduledTask[]>([])

  // Hydrate from IndexedDB on first access. getItemRaw is async; we fire it
  // without awaiting so the store is usable immediately (empty) and fills in
  // once the read resolves. The watch below will not double-write during
  // hydration because we set the refs directly before the watcher attaches.
  void Promise.all([
    storage.getItemRaw<NotebookEntry[]>(ENTRIES_KEY),
    storage.getItemRaw<ScheduledTask[]>(TASKS_KEY),
  ]).then(([savedEntries, savedTasks]) => {
    if (savedEntries)
      entries.value = savedEntries
    if (savedTasks)
      tasks.value = savedTasks
  })

  // Persist on any change. deep: true because entries/tasks are arrays of
  // objects mutated in place (push, status flips). The write is debounced by
  // Vue's reactivity batching within a microtask.
  watch(entries, (value) => {
    void storage.setItemRaw(ENTRIES_KEY, value)
  }, { deep: true })
  watch(tasks, (value) => {
    void storage.setItemRaw(TASKS_KEY, value)
  }, { deep: true })

  const partitionDiary = computed(() => entries.value.filter(entry => entry.kind === 'diary'))
  const partitionFocus = computed(() => entries.value.filter(entry => entry.kind === 'focus'))

  function addEntry(kind: NotebookEntryKind, text: string, options?: { tags?: string[], metadata?: Record<string, unknown> }) {
    const entry: NotebookEntry = {
      id: nanoid(),
      kind,
      text,
      createdAt: Date.now(),
      tags: options?.tags,
      metadata: options?.metadata,
    }

    entries.value.push(entry)
    return entry
  }

  function addNote(text: string, options?: { tags?: string[], metadata?: Record<string, unknown> }) {
    return addEntry('note', text, options)
  }

  function addDiaryEntry(text: string, options?: { tags?: string[], metadata?: Record<string, unknown> }) {
    return addEntry('diary', text, options)
  }

  function addFocusEntry(text: string, options?: { tags?: string[], metadata?: Record<string, unknown> }) {
    return addEntry('focus', text, options)
  }

  function scheduleTask(payload: {
    title: string
    details?: string
    priority?: TaskPriority
    dueAt?: number
    metadata?: Record<string, unknown>
  }) {
    const now = Date.now()
    const task: ScheduledTask = {
      id: nanoid(),
      title: payload.title,
      details: payload.details,
      priority: payload.priority ?? 'normal',
      status: payload.dueAt ? 'scheduled' : 'queued',
      dueAt: payload.dueAt,
      createdAt: now,
      updatedAt: now,
      metadata: payload.metadata,
    }

    tasks.value.push(task)
    return task
  }

  function markTaskDone(taskId: string) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.status = 'done'
    task.updatedAt = Date.now()
  }

  function requeueTask(taskId: string, options?: { dueAt?: number, reason?: string }) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.status = 'queued'
    task.dueAt = options?.dueAt
    task.updatedAt = Date.now()
    task.metadata = {
      ...task.metadata,
      requeueReason: options?.reason,
    }
  }

  function markTaskNotified(taskId: string, nextNotifyAt?: number) {
    const task = tasks.value.find(item => item.id === taskId)
    if (!task)
      return

    task.lastNotifiedAt = Date.now()
    task.nextNotifyAt = nextNotifyAt
    task.updatedAt = Date.now()
  }

  function getDueTasks(now: number, windowMs: number) {
    return tasks.value.filter((task) => {
      if (task.status === 'done' || task.status === 'dropped')
        return false
      const dueAt = task.dueAt ?? now
      if (dueAt > now + windowMs)
        return false
      if (typeof task.nextNotifyAt === 'number' && task.nextNotifyAt > now)
        return false
      return true
    })
  }

  return {
    entries,
    tasks,
    partitionDiary,
    partitionFocus,
    addNote,
    addDiaryEntry,
    addFocusEntry,
    scheduleTask,
    markTaskDone,
    requeueTask,
    markTaskNotified,
    getDueTasks,
  }
})
