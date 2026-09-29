import { describe, expect, it } from 'vitest'
import { SessionPreviewCache } from '../src/background/handler'
import type { StorageLike } from '../src/lib/storage'

class FakeSessionStorage implements StorageLike {
  private values: Record<string, unknown> = {}

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (typeof keys === 'string') return { [keys]: this.values[keys] }
    return this.values
  }

  async set(items: Record<string, unknown>): Promise<void> {
    this.values = { ...this.values, ...items }
  }
}

const capture = {
  windows: [{ tabs: [{ url: 'https://example.test', title: 'Example' }] }],
  includedTabCount: 1,
  excludedTabs: [],
}

describe('SessionPreviewCache', () => {
  it('keeps a preview available across cache instances', async () => {
    const storage = new FakeSessionStorage()
    const firstWorker = new SessionPreviewCache(storage)
    const token = await firstWorker.put(capture, 'current-window')

    const secondWorker = new SessionPreviewCache(storage)

    await expect(secondWorker.claim(token, 'current-window')).resolves.toEqual(capture)
  })

  it('releases a claimed preview so a failed save can be retried', async () => {
    const storage = new FakeSessionStorage()
    const cache = new SessionPreviewCache(storage)
    const token = await cache.put(capture, 'current-window')

    await expect(cache.claim(token, 'current-window')).resolves.toEqual(capture)
    await cache.release(token, capture, 'current-window')
    await expect(cache.claim(token, 'current-window')).resolves.toEqual(capture)
  })

  it('serializes claims across cache instances in one worker', async () => {
    const storage = new FakeSessionStorage()
    const firstCache = new SessionPreviewCache(storage)
    const secondCache = new SessionPreviewCache(storage)
    const token = await firstCache.put(capture, 'current-window')

    const claims = await Promise.all([
      firstCache.claim(token, 'current-window'),
      secondCache.claim(token, 'current-window'),
    ])

    expect(claims.filter(Boolean)).toHaveLength(1)
  })

  it('does not allow a claimed token to be replayed before completion or release', async () => {
    const storage = new FakeSessionStorage()
    const cache = new SessionPreviewCache(storage)
    const token = await cache.put(capture, 'current-window')

    await expect(cache.claim(token, 'current-window')).resolves.toEqual(capture)
    await expect(cache.claim(token, 'current-window')).resolves.toBeUndefined()
  })
})
