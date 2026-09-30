// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import Options from '../src/options/Options'

it('exports a compact backup that stays importable when indentation would exceed 32 MB', async () => {
  const backup = {
    schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z',
    sessions: [{
      id: '123e4567-e89b-42d3-a456-426614174000', name: 'Large', createdAt: '2026-09-30T00:00:00.000Z',
      windows: [{ tabs: [{ url: 'https://example.test', title: 'Example' }] }, ...Array(800_000).fill({ tabs: [] })],
    }],
  }
  expect(new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength).toBeGreaterThan(32 * 1024 * 1024)
  let downloaded: NodeBlob | undefined
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok: true, document: backup })) } })
  vi.stubGlobal('URL', {
    createObjectURL: (blob: NodeBlob) => { downloaded = blob; return 'blob:backup' },
    revokeObjectURL: vi.fn(),
  })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  try {
    await act(async () => root.render(<Options />))
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === '导出备份')!
    await act(async () => button.click())
    expect(downloaded).toBeDefined()
    expect(downloaded!.size).toBeLessThan(32 * 1024 * 1024)
    expect(JSON.parse(await downloaded!.text()).sessions[0].windows).toHaveLength(800_001)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    click.mockRestore()
    vi.unstubAllGlobals()
  }
})
