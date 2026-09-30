import { describe, expect, it } from 'vitest'
import { SessionBackupPreviewCache } from '../src/background/backup-previews'
import type { StorageLike } from '../src/lib/storage'

class FakeStorage implements StorageLike {
  private values: Record<string, unknown> = {}

  async get(key?: string | string[] | null): Promise<Record<string, unknown>> {
    if (typeof key === 'string') return { [key]: this.values[key] }
    return this.values
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...items }
  }
}

const document = { schemaVersion: 1 as const, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [] }

describe('SessionBackupPreviewCache', () => {
  it('releases a failed import preview across cache instances', async () => {
    const storage = new FakeStorage()
    const firstWorker = new SessionBackupPreviewCache(storage)
    const token = await firstWorker.put(document)
    await expect(firstWorker.claim(token, document)).resolves.toBe(true)
    await firstWorker.release(token)

    const secondWorker = new SessionBackupPreviewCache(storage)
    await expect(secondWorker.claim(token, document)).resolves.toBe(true)
  })

  it('accepts a large document without retaining its contents in session storage', async () => {
    const storage = new FakeStorage()
    const cache = new SessionBackupPreviewCache(storage)
    const large = {
      ...document,
      sessions: [{
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: 'Large',
        createdAt: document.exportedAt,
        windows: [{ tabs: [{ url: 'https://example.test', title: 'x'.repeat(2 * 1024 * 1024) }] }],
      }],
    }

    const token = await cache.put(large)
    const records = (await storage.get('tabstashBackupPreviews')).tabstashBackupPreviews as Record<string, unknown>
    expect(JSON.stringify(records).length).toBeLessThan(1000)
    await expect(cache.claim(token, large)).resolves.toBe(true)
  })

  it('does not claim a preview for a changed document', async () => {
    const cache = new SessionBackupPreviewCache(new FakeStorage())
    const token = await cache.put(document)

    await expect(cache.claim(token, { ...document, exportedAt: '2026-10-01T00:00:00.000Z' })).resolves.toBe(false)
    await expect(cache.claim(token, document)).resolves.toBe(true)
  })

  it('bounds retained previews and evicts the oldest token', async () => {
    const storage = new FakeStorage()
    const cache = new SessionBackupPreviewCache(storage)
    const tokens: string[] = []
    for (let index = 0; index < 21; index += 1) tokens.push(await cache.put(document))

    const records = (await storage.get('tabstashBackupPreviews')).tabstashBackupPreviews as Record<string, unknown>
    expect(Object.keys(records)).toHaveLength(20)
    await expect(cache.claim(tokens[0], document)).resolves.toBe(false)
    await expect(cache.claim(tokens[20], document)).resolves.toBe(true)
  })

})
