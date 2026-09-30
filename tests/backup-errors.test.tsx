// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Backup from '../src/options/Backup'
import { I18nProvider } from '../src/i18n/react'

describe('backup failure attribution', () => {
  let root: Root
  let container: HTMLDivElement
  const sendMessage = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('chrome', { runtime: { sendMessage }, i18n: { getUILanguage: () => 'en' } })
    sendMessage.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  async function selectFile(read: () => Promise<string>) {
    await act(async () => root.render(<I18nProvider><Backup /></I18nProvider>))
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 2, text: read }] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  }

  it('reports a preview connection failure without blaming the JSON file', async () => {
    sendMessage.mockRejectedValue(new Error('Port closed'))
    await selectFile(async () => '{}')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Cannot validate the backup right now. Please try again.')
    expect(container.querySelector('.import-preview')).toBeNull()
  })

  it('separates unreadable files from invalid JSON', async () => {
    await selectFile(async () => { throw new Error('Read denied') })
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Could not read the backup file. Choose it again.')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('still identifies malformed JSON without contacting the background', async () => {
    await selectFile(async () => '{bad')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('The file is not valid JSON.')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('reports an unconfirmed import and clears the possibly consumed token after response loss', async () => {
    sendMessage.mockImplementation(async ({ type }) => {
      if (type === 'preview-import') return { ok: true, previewToken: 'token', validation: { totalSessionCount: 1, sessionsToAdd: [{}], skippedSessionCount: 0 } }
      throw new Error('Response lost after import')
    })
    await selectFile(async () => '{}')
    await act(async () => container.querySelector<HTMLButtonElement>('.import-preview button')!.click())
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Import result unconfirmed. Check your saved sessions before importing again.')
    expect(container.querySelector('.import-preview')).toBeNull()
  })
})
