import { describe, expect, it, vi } from 'vitest'
import { handleMessage, type BackgroundDependencies } from '../src/background/handler'
import type { RestoreTask } from '../src/lib/restore'
import type { SavedSession, StoredState } from '../src/types/session'

const session: SavedSession = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: '工作',
  createdAt: '2026-09-30T00:00:00.000Z',
  windows: [
    { tabs: [{ url: 'https://one.test/one', title: 'One' }] },
    { tabs: [{ url: 'https://two.test/two', title: 'Two' }] },
  ],
}

function makeDependencies(): BackgroundDependencies & { tasks: RestoreTask[] } {
  let state: StoredState = { schemaVersion: 1, sessions: [session] }
  const tasks: RestoreTask[] = []
  return {
    tasks,
    store: {
      loadState: vi.fn(async () => state),
      addSession: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    windowsApi: {
      getCurrent: vi.fn(),
      getAll: vi.fn(),
    },
    createId: vi.fn()
      .mockReturnValueOnce('plan-1')
      .mockReturnValueOnce('task-1')
      .mockReturnValue('unused-id'),
    now: () => new Date('2026-09-30T01:00:00.000Z'),
    restoreApi: {
      createWindow: vi.fn(async () => ({ id: 100 })),
      createTab: vi.fn(async () => undefined),
    },
    restoreTaskStore: {
      save: vi.fn(async (task) => {
        const index = tasks.findIndex((candidate) => candidate.id === task.id)
        if (index === -1) tasks.push(task)
        else tasks[index] = task
      }),
      get: vi.fn(async (id) => tasks.find((task) => task.id === id)),
      list: vi.fn(async () => tasks),
    },
  }
}

describe('restore background messages', () => {
  it('starts a restore task without changing the saved session', async () => {
    const dependencies = makeDependencies()
    const response = await handleMessage({ type: 'restore-session', id: session.id, mode: 'preserve-windows', requestId: 'task-1' }, dependencies)

    expect(response).toMatchObject({ ok: true, task: { id: 'task-1', status: 'running' } })
    await vi.waitFor(() => expect(dependencies.restoreApi?.createWindow).toHaveBeenCalledTimes(2))
    expect(dependencies.store.loadState).toHaveBeenCalled()
    expect((await dependencies.store.loadState()).sessions).toEqual([session])
    expect(dependencies.tasks.at(-1)).toMatchObject({ status: 'completed', successfulTabCount: 2 })
  })

  it('returns persisted task state when the popup asks again', async () => {
    const dependencies = makeDependencies()
    await handleMessage({ type: 'restore-session', id: session.id, mode: 'merge-window', requestId: 'task-1' }, dependencies)
    await vi.waitFor(() => expect(dependencies.tasks.at(-1)?.status).toBe('completed'))

    await expect(handleMessage({ type: 'get-restore-task', taskId: 'task-1' }, dependencies)).resolves.toMatchObject({
      ok: true,
      task: { status: 'completed', createdWindowCount: 1 },
    })
    await expect(handleMessage({ type: 'list-restore-tasks' }, dependencies)).resolves.toMatchObject({
      ok: true,
      tasks: [{ id: 'task-1' }],
    })
  })

  it('does not start a task for a missing session', async () => {
    const dependencies = makeDependencies()

    await expect(handleMessage({ type: 'restore-session', id: 'missing', mode: 'preserve-windows', requestId: 'task-1' }, dependencies)).resolves.toEqual({
      ok: false,
      code: 'session-not-found',
      message: '找不到会话: missing',
    })
    expect(dependencies.restoreApi?.createWindow).not.toHaveBeenCalled()
  })

  it('rejects a second restore while another restore is still running', async () => {
    const dependencies = makeDependencies()
    let releaseWindow!: () => void
    const pendingWindow = new Promise<{ id: number }>((resolve) => {
      releaseWindow = () => resolve({ id: 200 })
    })
    dependencies.restoreApi!.createWindow = vi.fn(() => pendingWindow)

    await expect(handleMessage({ type: 'restore-session', id: session.id, mode: 'preserve-windows', requestId: 'task-1' }, dependencies)).resolves.toMatchObject({
      ok: true,
      task: { status: 'running' },
    })
    await expect(handleMessage({ type: 'restore-session', id: session.id, mode: 'merge-window', requestId: 'task-2' }, dependencies)).resolves.toEqual({
      ok: false,
      code: 'restore-busy',
      message: '已有恢复任务正在运行，请等待其结束',
    })

    releaseWindow()
    await vi.waitFor(() => expect(dependencies.restoreApi?.createWindow).toHaveBeenCalledOnce())
  })

  it('returns the existing task when the same restore request is retried after completion', async () => {
    const dependencies = makeDependencies()
    const message = { type: 'restore-session', id: session.id, mode: 'preserve-windows', requestId: 'task-1' }

    await expect(handleMessage(message, dependencies)).resolves.toMatchObject({ ok: true, task: { id: 'task-1' } })
    await vi.waitFor(() => expect(dependencies.tasks.at(-1)?.status).toBe('completed'))
    await expect(handleMessage(message, dependencies)).resolves.toMatchObject({ ok: true, task: { id: 'task-1', status: 'completed' } })
    expect(dependencies.restoreApi?.createWindow).toHaveBeenCalledTimes(2)
  })
})
