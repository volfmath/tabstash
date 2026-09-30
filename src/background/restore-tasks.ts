import type { StorageLike } from '../lib/storage'
import type { RestoreTask, RestoreTaskStore } from '../lib/restore'

export const RESTORE_TASKS_KEY = 'tabstashRestoreTasks'
export const RESTORE_TASK_STALE_MS = 60_000
const MAX_RESTORE_TASKS = 10

export interface RestoreTaskStoreApi extends RestoreTaskStore {
  get(id: string): Promise<RestoreTask | undefined>
  list(): Promise<RestoreTask[]>
}

export class SessionRestoreTaskStore implements RestoreTaskStoreApi {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => number = Date.now,
    private readonly isTaskActive: (id: string) => boolean = () => false,
  ) {}

  async save(task: RestoreTask): Promise<void> {
    const snapshot: RestoreTask = { ...task, failures: [...task.failures] }
    await this.enqueue(async () => {
      const tasks = await this.read()
      const next = [snapshot, ...tasks.filter((candidate) => candidate.id !== snapshot.id)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, MAX_RESTORE_TASKS)
      await this.storage.set({ [RESTORE_TASKS_KEY]: next })
    })
  }

  async get(id: string): Promise<RestoreTask | undefined> {
    return (await this.list()).find((task) => task.id === id)
  }

  async list(): Promise<RestoreTask[]> {
    return this.enqueue(async () => {
      const tasks = await this.read()
      const staleBefore = this.now() - RESTORE_TASK_STALE_MS
      let changed = false
      const next = tasks.map((task) => {
        if (
          task.status !== 'running' ||
          this.isTaskActive(task.id) ||
          Date.parse(task.updatedAt) >= staleBefore
        ) return task
        changed = true
        return { ...task, status: 'unconfirmed' as const, updatedAt: new Date(this.now()).toISOString() }
      }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_RESTORE_TASKS)
      if (next.length !== tasks.length) changed = true
      if (changed) await this.storage.set({ [RESTORE_TASKS_KEY]: next })
      return next
    })
  }

  private async read(): Promise<RestoreTask[]> {
    const result = await this.storage.get(RESTORE_TASKS_KEY)
    const value = result[RESTORE_TASKS_KEY]
    return Array.isArray(value) ? value.filter(isRestoreTask) : []
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.writeQueue.then(operation, operation)
    this.writeQueue = task.then(() => undefined, () => undefined)
    return task
  }
}

function isRestoreTask(value: unknown): value is RestoreTask {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const task = value as Partial<RestoreTask>
  return (
    typeof task.id === 'string' &&
    typeof task.sessionId === 'string' &&
    (task.mode === 'preserve-windows' || task.mode === 'merge-window') &&
    (task.status === 'running' || task.status === 'completed' || task.status === 'completed-with-errors' || task.status === 'unconfirmed') &&
    typeof task.totalTabCount === 'number' &&
    typeof task.processedTabCount === 'number' &&
    typeof task.successfulTabCount === 'number' &&
    typeof task.createdWindowCount === 'number' &&
    Array.isArray(task.failures) &&
    typeof task.startedAt === 'string' &&
    typeof task.updatedAt === 'string'
  )
}
