// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useI18n } from '../src/i18n/react'

const preferenceKey = 'tabstashLanguagePreference'

function Probe({ onValue }: { onValue: (value: ReturnType<typeof useI18n>) => void }) {
  const value = useI18n()
  onValue(value)
  return <output>{`${value.locale}|${value.preference}|${value.ready}|${value.preferenceError ?? ''}`}</output>
}

function makeChrome(get: () => Promise<Record<string, unknown>>, set: (items: Record<string, unknown>) => Promise<void>) {
  const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = []
  return {
    chrome: {
      storage: {
        local: { get, set },
        onChanged: {
          addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => listeners.push(listener),
          removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
            const index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
          },
        },
      },
      i18n: { getUILanguage: () => 'en-US' },
    },
    emit(change: chrome.storage.StorageChange) {
      for (const listener of listeners) listener({ [preferenceKey]: change }, 'local')
    },
  }
}

describe('I18nProvider', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('loads a stored preference and follows storage changes from another page', async () => {
    const set = vi.fn(async () => undefined)
    const harness = makeChrome(async () => ({ [preferenceKey]: 'en' }), set)
    vi.stubGlobal('chrome', harness.chrome)
    const values: Array<ReturnType<typeof useI18n>> = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => root.render(<I18nProvider><Probe onValue={(value) => values.push(value)} /></I18nProvider>))
    expect(values.at(-1)).toMatchObject({ locale: 'en', preference: 'en', ready: true, preferenceError: null })

    await act(async () => harness.emit({ newValue: 'zh-CN', oldValue: 'en' }))
    expect(values.at(-1)).toMatchObject({ locale: 'zh-CN', preference: 'zh-CN' })

    await act(async () => root.unmount())
  })

  it('reports storage write failures and does not claim the preference changed', async () => {
    const set = vi.fn(async () => { throw new Error('quota exceeded') })
    const harness = makeChrome(async () => ({}), set)
    vi.stubGlobal('chrome', harness.chrome)
    let current: ReturnType<typeof useI18n> | undefined
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => root.render(<I18nProvider><Probe onValue={(value) => { current = value }} /></I18nProvider>))
    await act(async () => {
      await expect(current!.setPreference('zh-CN')).rejects.toThrow('quota exceeded')
    })
    expect(current).toMatchObject({ preference: 'system', preferenceError: 'quota exceeded' })

    await act(async () => root.unmount())
  })

  it('reports storage read failures while still completing initialization', async () => {
    const harness = makeChrome(async () => { throw new Error('storage unavailable') }, vi.fn(async () => undefined))
    vi.stubGlobal('chrome', harness.chrome)
    let current: ReturnType<typeof useI18n> | undefined
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => root.render(<I18nProvider><Probe onValue={(value) => { current = value }} /></I18nProvider>))
    expect(current).toMatchObject({ preference: 'system', ready: true, preferenceError: 'storage unavailable' })

    await act(async () => root.unmount())
  })

  it('provides a zh-CN-compatible default context for consumers without a provider', async () => {
    let current: ReturnType<typeof useI18n> | undefined
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(<Probe onValue={(value) => { current = value }} />))
    expect(current).toMatchObject({ locale: 'zh-CN', preference: 'system', ready: true, preferenceError: null })
    await expect(current!.setPreference('en')).resolves.toBeUndefined()

    act(() => root.unmount())
  })
})
