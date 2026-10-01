import { describe, expect, it, vi } from 'vitest'
import { captureSession, type WindowsApi } from '../src/lib/session-capture'

function makeApi(): WindowsApi {
  return {
    getCurrent: vi.fn(),
    getAll: vi.fn(),
  }
}

describe('captureSession', () => {
  it('captures the current ordinary window and reports excluded URLs', async () => {
    const api = makeApi()
    vi.mocked(api.getCurrent).mockResolvedValue({
      type: 'normal',
      incognito: false,
      tabs: [
        { url: 'https://example.test/one', title: 'One' },
        { url: 'chrome://settings', title: 'Settings' },
      ],
    })

    await expect(captureSession('current-window', api)).resolves.toEqual({
      windows: [{ tabs: [{ url: 'https://example.test/one', title: 'One' }] }],
      includedTabCount: 1,
      excludedTabs: [{ url: 'chrome://settings', title: 'Settings', reason: 'unsupported-url' }],
    })
    expect(api.getAll).not.toHaveBeenCalled()
  })

  it('captures ordinary windows in browser order and omits incognito windows', async () => {
    const api = makeApi()
    vi.mocked(api.getAll).mockResolvedValue([
      { type: 'normal', incognito: false, tabs: [{ url: 'https://one.test', title: 'One' }] },
      { type: 'incognito', incognito: true, tabs: [{ url: 'https://private.test', title: 'Private' }] },
      { type: 'normal', incognito: false, tabs: [{ url: 'https://two.test', title: 'Two' }] },
    ])

    await expect(captureSession('all-windows', api)).resolves.toMatchObject({
      windows: [
        { tabs: [{ url: 'https://one.test', title: 'One' }] },
        { tabs: [{ url: 'https://two.test', title: 'Two' }] },
      ],
      includedTabCount: 2,
      excludedTabs: [{ url: 'https://private.test', title: 'Private', reason: 'unsupported-window' }],
    })
    expect(api.getAll).toHaveBeenCalledWith({ populate: true, windowTypes: ['normal'] })
  })

  it('preserves a missing title as the URL so a saved tab remains identifiable', async () => {
    const api = makeApi()
    vi.mocked(api.getCurrent).mockResolvedValue({
      type: 'normal',
      incognito: false,
      tabs: [{ url: 'https://example.test/no-title' }],
    })

    await expect(captureSession('current-window', api)).resolves.toMatchObject({
      windows: [{ tabs: [{ url: 'https://example.test/no-title', title: 'https://example.test/no-title' }] }],
    })
  })

  it('reports tabs from an unsupported current window instead of dropping them silently', async () => {
    const api = makeApi()
    vi.mocked(api.getCurrent).mockResolvedValue({
      type: 'devtools',
      tabs: [{ url: 'devtools://inspector', title: '开发者工具' }],
    })

    await expect(captureSession('current-window', api)).resolves.toEqual({
      windows: [],
      includedTabCount: 0,
      excludedTabs: [
        { url: 'devtools://inspector', title: '开发者工具', reason: 'unsupported-window' },
      ],
    })
  })

  it('leaves an empty excluded title for the localized UI to label', async () => {
    const api = makeApi()
    vi.mocked(api.getCurrent).mockResolvedValue({
      type: 'normal',
      tabs: [{}],
    })

    await expect(captureSession('current-window', api)).resolves.toMatchObject({
      excludedTabs: [{ title: '', reason: 'missing-url' }],
    })
  })

  it('captures a large tab set in one browser read while preserving order', async () => {
    const api = makeApi()
    const tabs = Array.from({ length: 120 }, (_, index) => ({
      url: `https://example.test/${index}`,
      title: `Tab ${index}`,
    }))
    vi.mocked(api.getCurrent).mockResolvedValue({ type: 'normal', tabs })

    const result = await captureSession('current-window', api)

    expect(result.includedTabCount).toBe(120)
    expect(result.windows[0]?.tabs[0]).toEqual(tabs[0])
    expect(result.windows[0]?.tabs[119]).toEqual(tabs[119])
    expect(api.getCurrent).toHaveBeenCalledOnce()
  })
})
