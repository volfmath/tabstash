import { describe, expect, it, vi } from 'vitest'
import { registerMessageListener, type MessageRuntime } from '../src/background/listener'
import type { BackgroundDependencies } from '../src/background/handler'

function makeDependencies(): BackgroundDependencies {
  return {
    store: {
      loadState: vi.fn(async () => ({ sessions: [] })),
      addSession: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    windowsApi: {
      getCurrent: vi.fn(async () => ({ type: 'normal', tabs: [] })),
      getAll: vi.fn(async () => []),
    },
    createId: () => 'id',
    now: () => new Date('2026-09-30T00:00:00.000Z'),
  }
}

function makeRuntime() {
  let listener: Parameters<MessageRuntime['onMessage']['addListener']>[0] | undefined
  const runtime: MessageRuntime = {
    onMessage: {
      addListener: (candidate) => {
        listener = candidate
      },
    },
  }
  return { runtime, getListener: () => listener }
}

describe('registerMessageListener', () => {
  it('keeps the async response channel open for a valid message', async () => {
    const { runtime, getListener } = makeRuntime()
    registerMessageListener(runtime, makeDependencies())
    const listener = getListener()
    if (!listener) throw new Error('listener was not registered')
    const sendResponse = vi.fn()

    expect(listener({ type: 'list-sessions' }, {}, sendResponse)).toBe(true)
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true, sessions: [] }))
  })

  it('responds synchronously to ping and invalid messages', () => {
    const { runtime, getListener } = makeRuntime()
    registerMessageListener(runtime, makeDependencies())
    const listener = getListener()
    if (!listener) throw new Error('listener was not registered')

    const pingResponse = vi.fn()
    expect(listener({ type: 'tabstash:ping' }, {}, pingResponse)).toBeUndefined()
    expect(pingResponse).toHaveBeenCalledWith({ type: 'tabstash:pong', ok: true })

    const invalidResponse = vi.fn()
    expect(listener({ type: 'unknown' }, {}, invalidResponse)).toBeUndefined()
    expect(invalidResponse).toHaveBeenCalledWith({
      ok: false,
      code: 'invalid-message',
      message: '无法识别的后台消息',
    })
  })
})
