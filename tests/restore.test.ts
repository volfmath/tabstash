import { describe, expect, it, vi } from 'vitest'
import {
  createRestorePlan,
  executeRestorePlan,
  type RestoreBrowserApi,
  type RestoreTaskStore,
} from '../src/lib/restore'
import type { SavedSession } from '../src/types/session'

function makeSession(windowCount = 2): SavedSession {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000',
    name: '工作',
    createdAt: '2026-09-30T00:00:00.000Z',
    windows: Array.from({ length: windowCount }, (_, windowIndex) => ({
      tabs: [
        { url: `https://window-${windowIndex}.test/one`, title: `窗口 ${windowIndex} 一` },
        { url: `https://window-${windowIndex}.test/two`, title: `窗口 ${windowIndex} 二` },
      ],
    })),
  }
}

function makeTaskStore(): RestoreTaskStore & { tasks: unknown[] } {
  const tasks: unknown[] = []
  return {
    tasks,
    save: vi.fn(async (task) => {
      const index = tasks.findIndex((candidate) => (candidate as { id: string }).id === task.id)
      if (index === -1) tasks.push(task)
      else tasks[index] = task
    }),
  }
}

describe('createRestorePlan', () => {
  it('keeps saved window and tab order for preserve mode', () => {
    const plan = createRestorePlan(makeSession(), 'preserve-windows', () => 'plan-1')

    expect(plan.windows.map((window) => window.tabs.map((tab) => tab.url))).toEqual([
      ['https://window-0.test/one', 'https://window-0.test/two'],
      ['https://window-1.test/one', 'https://window-1.test/two'],
    ])
    expect(plan.totalTabCount).toBe(4)
  })

  it('flattens all saved windows in order for merge mode', () => {
    const plan = createRestorePlan(makeSession(), 'merge-window', () => 'plan-2')

    expect(plan.windows).toHaveLength(1)
    expect(plan.windows[0].tabs.map((tab) => tab.title)).toEqual([
      '窗口 0 一', '窗口 0 二', '窗口 1 一', '窗口 1 二',
    ])
  })

  it('does not create a target window for an empty session', () => {
    const session = { ...makeSession(1), windows: [{ tabs: [] }] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-empty')

    expect(plan.windows).toEqual([])
    expect(plan.totalTabCount).toBe(0)
  })

  it('keeps invalid URLs in the failure list while preserving valid tab order', () => {
    const session = { ...makeSession(1), windows: [{ tabs: [
      { url: 'chrome://settings', title: '设置' },
      { url: 'https://valid.test/page', title: '有效页面' },
    ] }] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-invalid')

    expect(plan.windows).toEqual([{ tabs: [{ url: 'https://valid.test/page', title: '有效页面' }] }])
    expect(plan.invalidTabs).toEqual([{ url: 'chrome://settings', title: '设置', message: '网址协议不支持', code: 'unsupported-url' }])
    expect(plan.totalTabCount).toBe(2)
  })

  it('keeps an empty saved window in preserve mode', () => {
    const session = { ...makeSession(2), windows: [{ tabs: [] }, makeSession(1).windows[0]] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-empty-window')

    expect(plan.windows).toHaveLength(2)
    expect(plan.windows[0]).toEqual({ tabs: [] })
  })
})

describe('executeRestorePlan', () => {
  it('creates only new windows and records each successful tab', async () => {
    const api: RestoreBrowserApi = {
      createWindow: vi.fn(async (url) => ({ id: url === 'https://window-0.test/one' ? 101 : 102 })),
      createTab: vi.fn(async () => undefined),
    }
    const taskStore = makeTaskStore()
    const plan = createRestorePlan(makeSession(), 'preserve-windows', () => 'plan-3')

    const result = await executeRestorePlan(plan, api, taskStore, () => 'task-1', () => 1000)

    expect(api.createWindow).toHaveBeenCalledTimes(2)
    expect(api.createTab).toHaveBeenCalledTimes(2)
    expect(result.createdWindowCount).toBe(2)
    expect(result.successfulTabCount).toBe(4)
    expect(result.failures).toEqual([])
    expect(taskStore.tasks.at(-1)).toMatchObject({ status: 'completed', processedTabCount: 4 })
  })

  it('continues after one tab fails and reports the failure', async () => {
    const api: RestoreBrowserApi = {
      createWindow: vi.fn(async () => ({ id: 201 })),
      createTab: vi.fn(async ({ url }) => {
        if (url.endsWith('/two')) throw new Error('blocked by browser')
      }),
    }
    const taskStore = makeTaskStore()
    const session = { ...makeSession(1), windows: [{ tabs: [
      { url: 'https://one.test/one', title: 'One' },
      { url: 'https://two.test/two', title: 'Two' },
      { url: 'https://three.test/three', title: 'Three' },
    ] }] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-4')

    const result = await executeRestorePlan(plan, api, taskStore, () => 'task-2', () => 1000)

    expect(api.createWindow).toHaveBeenCalledOnce()
    expect(api.createTab).toHaveBeenCalledTimes(2)
    expect(result.successfulTabCount).toBe(2)
    expect(result.failures).toEqual([{ url: 'https://two.test/two', title: 'Two', message: 'blocked by browser', code: 'browser-open-failed' }])
    expect(taskStore.tasks.at(-1)).toMatchObject({ status: 'completed-with-errors', processedTabCount: 3 })
  })

  it('completes an empty plan without creating a window', async () => {
    const api: RestoreBrowserApi = {
      createWindow: vi.fn(),
      createTab: vi.fn(),
    }
    const taskStore = makeTaskStore()
    const session = { ...makeSession(1), windows: [{ tabs: [] }] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-empty-execute')

    const result = await executeRestorePlan(plan, api, taskStore, () => 'task-empty', () => 1000)

    expect(api.createWindow).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'completed', createdWindowCount: 0, successfulTabCount: 0, failures: [] })
    expect(taskStore.tasks.at(-1)).toMatchObject({ status: 'completed', processedTabCount: 0 })
  })

  it('checkpoints long restores in batches and always saves the final result', async () => {
    const tabs = Array.from({ length: 25 }, (_, index) => ({
      url: `https://batch.test/${index}`,
      title: `Batch ${index}`,
    }))
    const api: RestoreBrowserApi = {
      createWindow: vi.fn(async () => ({ id: 301 })),
      createTab: vi.fn(async () => undefined),
    }
    const taskStore = makeTaskStore()
    const session = { ...makeSession(1), windows: [{ tabs }] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-batch')

    await executeRestorePlan(plan, api, taskStore, () => 'task-batch', () => 1000)

    expect(taskStore.save).toHaveBeenCalledTimes(4)
    expect(taskStore.tasks.at(-1)).toMatchObject({ status: 'completed', processedTabCount: 25 })
  })

  it('creates a blank target window for an empty saved window', async () => {
    const api: RestoreBrowserApi = {
      createWindow: vi.fn(async (url) => ({ id: url ? 302 : 303 })),
      createTab: vi.fn(async () => undefined),
    }
    const taskStore = makeTaskStore()
    const session = { ...makeSession(2), windows: [{ tabs: [] }, makeSession(1).windows[0]] }
    const plan = createRestorePlan(session, 'preserve-windows', () => 'plan-empty-window-execute')

    const result = await executeRestorePlan(plan, api, taskStore, () => 'task-empty-window', () => 1000)

    expect(api.createWindow).toHaveBeenNthCalledWith(1)
    expect(api.createWindow).toHaveBeenNthCalledWith(2, 'https://window-0.test/one')
    expect(result.createdWindowCount).toBe(2)
  })
})
