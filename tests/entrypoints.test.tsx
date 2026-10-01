// @vitest-environment jsdom
import { act } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackgroundResponse } from '../src/background/messages'

const { roots } = vi.hoisted(() => ({ roots: [] as Root[] }))
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      roots.push(root)
      return root
    },
  }
})

const session = {
  id: '123e4567-e89b-42d3-a456-426614174000', name: 'Fixture', createdAt: '2026-09-30T00:00:00.000Z',
  windows: [{ tabs: [{ url: 'https://example.test/', title: 'Fixture' }] }],
}
const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>()
const sendMessage = vi.fn()

const legacyPreviewResponse: BackgroundResponse = {
  ok: true,
  previewToken: 'legacy-preview',
  preview: { windows: session.windows, includedTabCount: 1, excludedTabs: [] },
}
void legacyPreviewResponse

async function switchLanguage(locale: 'en' | 'zh-CN') {
  await act(async () => {
    for (const listener of listeners) listener({ tabstashLanguagePreference: { newValue: locale } }, 'local')
  })
}

async function fillName(name: string) {
  const input = document.querySelector<HTMLInputElement>('.save-form input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('localized page entrypoints', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.lang = 'zh-CN'
    document.title = 'Tabstash'
    window.history.replaceState(null, '', '/')
    sendMessage.mockReset().mockImplementation(async ({ type }) => {
      if (type === 'list-sessions') return { ok: true, sessions: [session] }
      if (type === 'list-restore-tasks') return { ok: true, tasks: [] }
      if (type === 'preview-session') return {
        ok: true, previewToken: 'save-token', preview: { windows: session.windows, includedTabCount: 1, excludedTabs: [] },
      }
      if (type === 'preview-import') return {
        ok: true, previewToken: 'import-token', validation: { totalSessionCount: 1, sessionsToAdd: [session], skippedSessionCount: 0 },
      }
      return { ok: false, code: 'unknown-error', message: 'Fixture error' }
    })
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, getManifest: () => ({ version: '0.2.0' }) },
      i18n: { getUILanguage: () => 'en-US' },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.add(listener), removeListener: (listener: typeof listeners extends Set<infer T> ? T : never) => listeners.delete(listener) },
      },
    })
  })

  afterEach(async () => {
    await act(async () => { for (const root of roots.splice(0)) root.unmount() })
    expect(listeners.size).toBe(0)
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('keeps a popup draft when another page changes the language', async () => {
    await act(async () => { await import('../src/popup/main') })
    await fillName('Keep this draft')
    await switchLanguage('zh-CN')
    expect(document.querySelector<HTMLInputElement>('.save-form input')?.value).toBe('Keep this draft')
    expect(document.body.textContent).toContain('预览并保存')
  })

  it('keeps the exact save preview and confirmation token across a language change', async () => {
    await act(async () => { await import('../src/popup/main') })
    await fillName('Draft preview')
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(document.querySelector('.preview-panel')).not.toBeNull()
    await switchLanguage('zh-CN')
    expect(document.querySelector('.preview-panel h2')?.textContent).toBe('Draft preview')
    await act(async () => document.querySelector<HTMLButtonElement>('.preview-panel .primary-button')!.click())
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-session', previewToken: 'save-token', name: 'Draft preview' }))
  })

  it('keeps a blank preview name stable across a language change and supports an older backend response', async () => {
    await act(async () => { await import('../src/popup/main') })
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(document.querySelector('.preview-panel h2')?.textContent).toBe('Session 1')
    await switchLanguage('zh-CN')
    expect(document.querySelector('.preview-panel h2')?.textContent).toBe('Session 1')
    await act(async () => document.querySelector<HTMLButtonElement>('.preview-panel .primary-button')!.click())
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'save-session',
      previewToken: 'save-token',
      name: 'Session 1',
      locale: 'en',
    }))
  })

  it('keeps the unconfirmed restore request ID when the language changes', async () => {
    const requests: string[] = []
    const defaultHandler = sendMessage.getMockImplementation()!
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'restore-session') {
        requests.push(message.requestId)
        throw new Error('Response lost')
      }
      return defaultHandler(message)
    })
    await act(async () => { await import('../src/popup/main') })
    await act(async () => document.querySelector<HTMLButtonElement>('.restore-button')!.click())
    await switchLanguage('zh-CN')
    expect(document.querySelector('.feedback--error')).not.toBeNull()
    expect(document.querySelector('.feedback--error')?.textContent).toContain('恢复启动结果未知')
    await act(async () => document.querySelector<HTMLButtonElement>('.restore-button')!.click())
    expect(requests).toHaveLength(2)
    expect(requests[1]).toBe(requests[0])
  })

  it('keeps an options import preview and its token across a language change', async () => {
    window.history.replaceState(null, '', '/#backup')
    await act(async () => { await import('../src/options/main') })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [{ size: 2, text: async () => '{}' }] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(document.querySelector('.import-preview')).not.toBeNull()
    await switchLanguage('zh-CN')
    expect(document.querySelector('.import-preview')?.textContent).toContain('确认导入')
    expect(document.querySelector('[role="status"]')?.textContent).toBe('文件校验通过，请确认导入。')
    await act(async () => document.querySelector<HTMLButtonElement>('.import-preview button')!.click())
    expect(sendMessage).toHaveBeenCalledWith({ type: 'import-backup', previewToken: 'import-token', document: {} })
  })

  it.each(['popup', 'options'] as const)('updates %s document language and page title', async (page) => {
    await act(async () => {
      if (page === 'popup') await import('../src/popup/main')
      else await import('../src/options/main')
    })
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe(page === 'popup' ? 'Tabstash' : 'Tabstash manager')
    await switchLanguage('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(document.title).toBe(page === 'popup' ? 'Tabstash' : 'Tabstash 管理页')
  })

  it('uses the current language for a late storage-listener failure', async () => {
    await act(async () => { await import('../src/popup/main') })
    await switchLanguage('zh-CN')
    sendMessage.mockResolvedValue({ ok: false, code: 'storage-error', message: 'Storage failed' })
    await act(async () => {
      for (const listener of listeners) listener({ tabstashState: { newValue: {} } }, 'local')
    })
    expect(document.querySelector('.feedback--error')?.textContent).toBe('无法访问本地会话。')
  })

  it('uses the current language for restore polling errors and keeps polling', async () => {
    vi.useFakeTimers()
    const task = { id: 'task-1', sessionId: session.id, mode: 'preserve-windows', status: 'running', totalTabCount: 1, processedTabCount: 0, successfulTabCount: 0, createdWindowCount: 0, failures: [], startedAt: session.createdAt, updatedAt: session.createdAt }
    const defaultHandler = sendMessage.getMockImplementation()!
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'list-restore-tasks') return { ok: true, tasks: [task] }
      if (message.type === 'get-restore-task') throw new Error('Temporarily unavailable')
      return defaultHandler(message)
    })
    try {
      await act(async () => { await import('../src/popup/main') })
      await switchLanguage('zh-CN')
      await act(async () => vi.advanceTimersByTime(1000))
      expect(document.querySelector('.feedback--error')?.textContent).toBe('暂时无法读取恢复进度，正在重试')
      await switchLanguage('en')
      expect(document.querySelector('.feedback--error')?.textContent).toBe('Cannot read restore progress. Retrying…')
      await act(async () => vi.advanceTimersByTime(1000))
      expect(sendMessage.mock.calls.filter(([message]) => message.type === 'get-restore-task')).toHaveLength(2)
    } finally {
      await act(async () => { for (const root of roots.splice(0)) root.unmount() })
      vi.useRealTimers()
    }
  })
})
