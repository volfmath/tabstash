// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Options from '../src/options/Options'
import { I18nProvider } from '../src/i18n/react'

vi.mock('../src/popup/Popup', () => ({
  default: ({ variant }: { variant?: string }) => <div data-session-view={variant}>Sessions content</div>,
}))

describe('Options navigation and feedback', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    window.history.replaceState(null, '', '/')
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    window.history.replaceState(null, '', '/')
    vi.unstubAllGlobals()
  })

  async function mount(hash = '') {
    window.history.replaceState(null, '', `/${hash}`)
    await act(async () => root.render(<Options />))
  }

  it('defaults to the full sessions view with accessible navigation', async () => {
    await mount()
    expect(container.querySelector('[data-session-view="manager"]')).not.toBeNull()
    expect(window.location.hash).toBe('#sessions')
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute('href')).toBe('#sessions')
    expect(container.querySelectorAll('nav a')).toHaveLength(3)
  })

  it('opens the backup deep link and reacts to history hash changes', async () => {
    await mount('#backup')
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
    expect(container.querySelector('[data-session-view]')).toBeNull()
    await act(async () => {
      window.history.replaceState(null, '', '/#settings')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(container.querySelector('select')).not.toBeNull()
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(container.querySelector('nav a[aria-current="page"]')?.getAttribute('href')).toBe('#settings')
  })

  it('updates both the active view and hash when navigating', async () => {
    await mount()
    const settings = container.querySelector<HTMLAnchorElement>('nav a[href="#settings"]')
    expect(settings).not.toBeNull()
    await act(async () => settings!.click())
    expect(window.location.hash).toBe('#settings')
    expect(container.querySelector('select')).not.toBeNull()
  })

  it('normalizes an unknown view to sessions', async () => {
    await mount('#missing')
    expect(window.location.hash).toBe('#sessions')
    expect(container.querySelector('[data-session-view="manager"]')).not.toBeNull()
  })

  it('offers only public feedback links without session data or an invented email', async () => {
    await mount('#settings')
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('main a'))
    expect(links.map((link) => link.href)).toEqual([
      'https://gitee.com/moreandmoregames/tabstash/issues/',
      'https://gitee.com/moreandmoregames/tabstash/issues/',
      'https://gitee.com/moreandmoregames/tabstash/commits/main',
    ])
    for (const link of links) {
      expect(new URL(link.href).search).toBe('')
      expect(link.target).toBe('_blank')
      expect(link.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
      expect(link.getAttribute('referrerpolicy')).toBe('no-referrer')
    }
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull()
  })

  it('persists a manual language choice through the i18n provider', async () => {
    const set = vi.fn(async () => undefined)
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: vi.fn(async () => ({})), set },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      i18n: { getUILanguage: () => 'zh-CN' },
    })
    window.history.replaceState(null, '', '/#settings')
    await act(async () => root.render(<I18nProvider><Options /></I18nProvider>))
    const language = container.querySelector<HTMLSelectElement>('select')!
    await act(async () => {
      language.value = 'en'
      language.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(set).toHaveBeenCalledWith({ tabstashLanguagePreference: 'en' })
    expect(language.value).toBe('en')
    expect(container.textContent).toContain('Language')
  })
})
