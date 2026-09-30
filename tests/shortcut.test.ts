import { describe, expect, it, vi } from 'vitest'
import { openSavePopupOrOptions } from '../src/background/shortcut'

describe('save shortcut fallback', () => {
  it('opens the popup when Chrome allows it', async () => {
    const api = {
      openPopup: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(async () => undefined),
    }

    await expect(openSavePopupOrOptions(api)).resolves.toBe('popup')
    expect(api.openOptionsPage).not.toHaveBeenCalled()
  })

  it('opens options with a save entry when popup opening is rejected', async () => {
    const api = {
      openPopup: vi.fn(async () => { throw new Error('not allowed') }),
      openOptionsPage: vi.fn(async () => undefined),
    }

    await expect(openSavePopupOrOptions(api)).resolves.toBe('options')
    expect(api.openOptionsPage).toHaveBeenCalledOnce()
  })

  it('reports when both browser entry points are unavailable', async () => {
    const api = {
      openPopup: vi.fn(async () => { throw new Error('not allowed') }),
      openOptionsPage: vi.fn(async () => { throw new Error('not allowed') }),
    }

    await expect(openSavePopupOrOptions(api)).resolves.toBe('unavailable')
  })
})
