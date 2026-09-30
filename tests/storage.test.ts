import { describe, expect, it } from 'vitest'
import {
  MAX_SESSIONS,
  STORAGE_KEY,
  SessionStore,
  StorageAccessError,
  StorageLimitError,
  StorageValidationError,
  type StorageLike,
} from '../src/lib/storage'
import type { SavedSession, StoredState } from '../src/types/session'

class FakeStorage implements StorageLike {
  value: unknown = undefined
  writes = 0
  reads = 0
  failWrites = false

  async get(): Promise<Record<string, unknown>> {
    this.reads += 1
    return { [STORAGE_KEY]: this.value }
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.writes += 1
    if (this.failWrites) throw new Error('quota exceeded')
    this.value = items[STORAGE_KEY]
  }
}

function makeSession(id: string, name = id): SavedSession {
  const suffix = Array.from(id)
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(12, '0')
    .slice(0, 12)
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    name,
    createdAt: '2026-09-30T00:00:00.000Z',
    windows: [{ tabs: [{ url: 'https://example.test/' + id, title: name }] }],
  }
}

describe('SessionStore', () => {
  it('returns a versioned empty state when storage is empty', async () => {
    const store = new SessionStore(new FakeStorage())

    await expect(store.loadState()).resolves.toEqual({ schemaVersion: 1, sessions: [] })
  })

  it('rejects unsupported or malformed stored state instead of silently replacing it', async () => {
    const storage = new FakeStorage()
    storage.value = { schemaVersion: 99, sessions: [] }

    await expect(new SessionStore(storage).loadState()).rejects.toBeInstanceOf(StorageValidationError)
  })

  it('rejects a stored session with no tabs', async () => {
    const storage = new FakeStorage()
    storage.value = {
      schemaVersion: 1,
      sessions: [{ id: '00000000-0000-4000-8000-656d70747900', name: '空', createdAt: '2026-09-30T00:00:00.000Z', windows: [] }],
    }

    await expect(new SessionStore(storage).loadState()).rejects.toBeInstanceOf(StorageValidationError)
  })

  it('rejects non-UUID IDs and non-canonical timestamps', async () => {
    const storage = new FakeStorage()
    storage.value = {
      schemaVersion: 1,
      sessions: [
        {
          ...makeSession('valid'),
          id: 'not-an-uuid',
        },
      ],
    }
    await expect(new SessionStore(storage).loadState()).rejects.toBeInstanceOf(StorageValidationError)

    storage.value = {
      schemaVersion: 1,
      sessions: [
        {
          ...makeSession('valid'),
          createdAt: '2026-09-30',
        },
      ],
    }
    await expect(new SessionStore(storage).loadState()).rejects.toBeInstanceOf(StorageValidationError)
  })

  it('allows five sessions but rejects a sixth without changing stored data', async () => {
    const storage = new FakeStorage()
    const store = new SessionStore(storage)
    for (let index = 0; index < MAX_SESSIONS; index += 1) {
      await store.addSession(makeSession(String(index)))
    }
    const before = await store.loadState()

    await expect(store.addSession(makeSession('sixth'))).rejects.toBeInstanceOf(StorageLimitError)
    await expect(store.loadState()).resolves.toEqual(before)
  })

  it('serializes concurrent additions so neither session is lost', async () => {
    const storage = new FakeStorage()
    const store = new SessionStore(storage)

    await Promise.all([store.addSession(makeSession('one')), store.addSession(makeSession('two'))])

    const state = await store.loadState()
    expect(state.sessions.map((session) => session.id)).toEqual([makeSession('one').id, makeSession('two').id])
  })

  it('maps a failed write and leaves the previous state readable', async () => {
    const storage = new FakeStorage()
    const store = new SessionStore(storage)
    await store.addSession(makeSession('existing'))
    storage.failWrites = true

    await expect(store.addSession(makeSession('new'))).rejects.toBeInstanceOf(StorageAccessError)
    await expect(store.loadState()).resolves.toEqual({
      schemaVersion: 1,
      sessions: [makeSession('existing')],
    })
    expect(storage.reads).toBe(4)
  })

  it('rejects a duplicate session ID before writing a new state', async () => {
    const storage = new FakeStorage()
    const store = new SessionStore(storage)
    await store.addSession(makeSession('same', '原名称'))

    await expect(store.addSession(makeSession('same', '重复名称'))).rejects.toBeInstanceOf(
      StorageValidationError,
    )
    expect(storage.writes).toBe(1)
    await expect(store.loadState()).resolves.toEqual({
      schemaVersion: 1,
      sessions: [makeSession('same', '原名称')],
    })
  })

  it('renames and deletes only the requested session', async () => {
    const store = new SessionStore(new FakeStorage())
    await store.addSession(makeSession('one'))
    await store.addSession(makeSession('two'))

    await store.renameSession(makeSession('one').id, 'Renamed')
    await store.deleteSession(makeSession('two').id)

    await expect(store.loadState()).resolves.toEqual({
      schemaVersion: 1,
      sessions: [{ ...makeSession('one'), name: 'Renamed' }],
    })
  })

  it('imports a validated batch atomically', async () => {
    const storage = new FakeStorage()
    const store = new SessionStore(storage)
    await store.addSession(makeSession('existing'))

    await store.importSessions([makeSession('one'), makeSession('two')])

    await expect(store.loadState()).resolves.toEqual({
      schemaVersion: 1,
      sessions: [makeSession('existing'), makeSession('one'), makeSession('two')],
    })
  })

  it('calculates skipped IDs against the state at commit time', async () => {
    const store = new SessionStore(new FakeStorage())
    const existing = makeSession('existing')
    await store.addSession(existing)
    await store.deleteSession(existing.id)

    const result = await store.importSessions([existing, makeSession('new')])

    expect(result).toMatchObject({ addedSessionCount: 2, skippedSessionCount: 0 })
    expect(result.state.sessions).toEqual([existing, makeSession('new')])
  })
})
