// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Popup from '../src/popup/Popup'
import type { BackgroundMessage } from '../src/background/messages'
import type { RestoreTask } from '../src/lib/restore'

const session = {
  id: '123e4567-e89b-42d3-a456-426614174000', name: 'Work', createdAt: '2026-09-30T00:00:00.000Z',
  windows: [{ tabs: [{ url: 'https://example.test', title: 'Example' }] }],
}
const task: RestoreTask = {
  id: 'task-1', sessionId: session.id, mode: 'preserve-windows', status: 'running',
  totalTabCount: 1, processedTabCount: 0, successfulTabCount: 0, createdWindowCount: 0,
  failures: [], startedAt: session.createdAt, updatedAt: session.createdAt,
}

describe('Popup restore lifecycle', () => {
  let container: HTMLDivElement
  let root: Root
  const sendMessage = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    vi.stubGlobal('chrome', { runtime: { sendMessage, getManifest: () => ({ version: '0.1.0' }), openOptionsPage: vi.fn() } })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    sendMessage.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function restoreButton(): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '恢复')!
  }

  async function mount() {
    await act(async () => root.render(<Popup />))
  }

  it('keeps an uncertain request ID after a structured storage error', async () => {
    const ids: string[] = []
    sendMessage.mockImplementation(async (message: BackgroundMessage) => {
      if (message.type === 'list-sessions') return { ok: true, sessions: [session] }
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [] }
      if (message.type === 'get-restore-task') throw new Error('temporarily unavailable')
      if (message.type === 'restore-session') {
        ids.push(message.requestId)
        if (ids.length === 1) throw new Error('response lost')
        if (ids.length === 2) return { ok: false, code: 'storage-error', message: 'storage unavailable' }
        return { ok: true, task: { ...task, id: message.requestId } }
      }
    })
    await mount()
    for (let index = 0; index < 3; index += 1) {
      await act(async () => restoreButton().click())
    }
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
  })

  it('disables restore while a task is running and keeps polling it', async () => {
    sendMessage.mockImplementation(async (message: BackgroundMessage) => {
      if (message.type === 'list-sessions') return { ok: true, sessions: [session] }
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [task] }
      if (message.type === 'get-restore-task') return { ok: true, task }
      return { ok: false, code: 'restore-busy', message: 'busy' }
    })
    await mount()
    expect(restoreButton().disabled).toBe(true)
    await act(async () => restoreButton().click())
    await act(async () => vi.advanceTimersByTime(1000))
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'get-restore-task')).toBe(true)
    expect(sendMessage.mock.calls.some(([message]) => message.type === 'restore-session')).toBe(false)
  })

  it('keeps polling after a transient task query failure', async () => {
    let polls = 0
    sendMessage.mockImplementation(async (message: BackgroundMessage) => {
      if (message.type === 'list-sessions') return { ok: true, sessions: [session] }
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [task] }
      if (message.type === 'get-restore-task') {
        polls += 1
        if (polls === 1) throw new Error('temporarily unavailable')
        return { ok: true, task: { ...task, status: 'completed' } }
      }
    })
    await mount()
    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.textContent).toContain('恢复中')
    await act(async () => vi.advanceTimersByTime(1000))
    expect(container.textContent).toContain('恢复完成')
    expect(polls).toBe(2)
  })

  it('offers a manager entry and keeps label details out of the quick popup', async () => {
    const openOptionsPage = vi.fn()
    chrome.runtime.openOptionsPage = openOptionsPage
    sendMessage.mockImplementation(async (message: BackgroundMessage) => {
      if (message.type === 'list-sessions') return { ok: true, sessions: [session] }
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [] }
    })
    await mount()
    expect(container.querySelector('.session-details')).toBeNull()
    const manager = container.querySelector<HTMLButtonElement>('[aria-label="打开管理页"]')!
    expect(manager).not.toBeNull()
    await act(async () => manager.click())
    expect(openOptionsPage).toHaveBeenCalledOnce()
  })

  it('uses a separate preview step and returns to the list on cancel', async () => {
    sendMessage.mockImplementation(async (message: BackgroundMessage) => {
      if (message.type === 'list-sessions') return { ok: true, sessions: [session] }
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [] }
      if (message.type === 'preview-session') return {
        ok: true, previewToken: 'preview-1', preview: { windows: session.windows, includedTabCount: 1, excludedTabs: [] },
      }
    })
    await mount()
    const input = container.querySelector<HTMLInputElement>('.save-form input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'New session')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('.preview-panel')).not.toBeNull()
    expect(container.querySelector('.save-form')).toBeNull()
    expect(container.querySelector('.session-list')).toBeNull()
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('返回'))!.click())
    expect(container.querySelector('.save-form')).not.toBeNull()
    expect(container.querySelector('.session-list')).not.toBeNull()
  })
})
