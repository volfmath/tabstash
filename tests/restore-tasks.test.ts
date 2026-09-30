import { describe, expect, it } from 'vitest'
import { SessionRestoreTaskStore } from '../src/background/restore-tasks'
import type { StorageLike } from '../src/lib/storage'
import type { RestoreTask } from '../src/lib/restore'

class FakeStorage implements StorageLike {
  values: Record<string, unknown> = {}

  async get(key?: string | string[] | null): Promise<Record<string, unknown>> {
    if (typeof key === 'string') return { [key]: this.values[key] }
    return this.values
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...items }
  }
}

class BlockingStorage extends FakeStorage {
  private setCount = 0
  private readonly releaseSecondSetPromise: Promise<void>
  private releaseSecondSet!: () => void
  readonly secondSetStarted: Promise<void>
  private signalSecondSetStarted!: () => void
  readonly thirdSetStarted: Promise<void>
  private signalThirdSetStarted!: () => void

  constructor() {
    super()
    this.secondSetStarted = new Promise((resolve) => {
      this.signalSecondSetStarted = resolve
    })
    this.releaseSecondSetPromise = new Promise((resolve) => {
      this.releaseSecondSet = resolve
    })
    this.thirdSetStarted = new Promise((resolve) => {
      this.signalThirdSetStarted = resolve
    })
  }

  releaseSet(): void {
    this.releaseSecondSet()
  }

  override async set(items: Record<string, unknown>): Promise<void> {
    this.setCount += 1
    if (this.setCount === 2) {
      this.signalSecondSetStarted()
      await this.releaseSecondSetPromise
    }
    if (this.setCount === 3) {
      this.signalThirdSetStarted()
    }
    await super.set(items)
  }
}

function task(updatedAt: string): RestoreTask {
  return {
    id: 'task-1', sessionId: 'session-1', mode: 'preserve-windows', status: 'running',
    totalTabCount: 1, processedTabCount: 0, successfulTabCount: 0, createdWindowCount: 0,
    failures: [], startedAt: updatedAt, updatedAt,
  }
}

describe('SessionRestoreTaskStore', () => {
  it('marks a stale running task as unconfirmed without retrying it', async () => {
    const storage = new FakeStorage()
    const clock = new Date('2026-09-30T01:02:00.000Z').getTime()
    const store = new SessionRestoreTaskStore(storage, () => clock)
    await store.save(task('2026-09-30T00:00:00.000Z'))

    await expect(store.list()).resolves.toMatchObject([{ id: 'task-1', status: 'unconfirmed' }])
    await expect(store.list()).resolves.toMatchObject([{ id: 'task-1', status: 'unconfirmed' }])
  })

  it('keeps recent running tasks resumable only as status, never by rerunning browser work', async () => {
    const storage = new FakeStorage()
    const store = new SessionRestoreTaskStore(storage, () => new Date('2026-09-30T01:00:30.000Z').getTime())
    await store.save(task('2026-09-30T01:00:00.000Z'))

    await expect(store.get('task-1')).resolves.toMatchObject({ status: 'running' })
  })

  it('does not mark a task unconfirmed while this worker still owns it', async () => {
    const storage = new FakeStorage()
    const clock = new Date('2026-09-30T01:02:00.000Z').getTime()
    const store = new SessionRestoreTaskStore(storage, () => clock, () => true)
    await store.save(task('2026-09-30T00:00:00.000Z'))

    await expect(store.list()).resolves.toMatchObject([{ id: 'task-1', status: 'running' }])
  })

  it('serializes stale cleanup with a concurrent task write', async () => {
    const storage = new BlockingStorage()
    const clock = new Date('2026-09-30T01:02:00.000Z').getTime()
    const store = new SessionRestoreTaskStore(storage, () => clock)
    await store.save(task('2026-09-30T00:00:00.000Z'))

    const listPromise = store.list()
    await storage.secondSetStarted

    const latestTask: RestoreTask = {
      ...task('2026-09-30T01:02:00.000Z'),
      status: 'completed',
      updatedAt: '2026-09-30T01:02:00.000Z',
    }
    const savePromise = store.save(latestTask)
    const concurrentWriteStarted = await Promise.race([
      storage.thirdSetStarted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
    ])
    expect(concurrentWriteStarted).toBe(false)
    storage.releaseSet()

    await Promise.all([listPromise, savePromise])
    await expect(store.get('task-1')).resolves.toMatchObject({ status: 'completed' })
  })
})
