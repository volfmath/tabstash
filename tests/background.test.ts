import { describe, expect, it, vi } from 'vitest'
import { handleMessage, type BackgroundDependencies, type PreviewCache } from '../src/background/handler'
import { MemoryBackupPreviewCache } from '../src/background/backup-previews'
import { StorageAccessError } from '../src/lib/storage'
import type { SavedSession, StoredState } from '../src/types/session'
import type { WindowsApi } from '../src/lib/session-capture'

function makeStore(initial: StoredState = { schemaVersion: 1, sessions: [] }) {
  let state = initial
  return {
    loadState: vi.fn(async () => state),
    addSession: vi.fn(async (session: SavedSession) => {
      state = { ...state, sessions: [...state.sessions, session] }
      return state
    }),
    importSessions: vi.fn(async (sessions: SavedSession[]) => {
      const existingIds = new Set(state.sessions.map((session) => session.id.toLowerCase()))
      const added = sessions.filter((session) => !existingIds.has(session.id.toLowerCase()))
      state = { ...state, sessions: [...state.sessions, ...added] }
      return { addedSessionCount: added.length, skippedSessionCount: sessions.length - added.length }
    }),
    renameSession: vi.fn(async (id: string, name: string) => {
      state = { ...state, sessions: state.sessions.map((session) => (session.id === id ? { ...session, name } : session)) }
      return state
    }),
    deleteSession: vi.fn(async (id: string) => {
      state = { ...state, sessions: state.sessions.filter((session) => session.id !== id) }
      return state
    }),
  }
}

function makeApi(): WindowsApi {
  return {
    getCurrent: vi.fn(async () => ({ type: 'normal', incognito: false, tabs: [{ url: 'https://example.test', title: 'Example' }] })),
    getAll: vi.fn(),
  }
}

function makeDependencies(): BackgroundDependencies {
  return {
    store: makeStore(),
    windowsApi: makeApi(),
    createId: () => 'session-id',
    now: () => new Date('2026-09-30T00:00:00.000Z'),
  }
}

describe('handleMessage', () => {
  it('saves a captured session only after collecting the requested scope', async () => {
    const dependencies = makeDependencies()

    await expect(
      handleMessage({ type: 'save-session', name: '工作', scope: 'current-window' }, dependencies),
    ).resolves.toMatchObject({
      ok: true,
      session: {
        id: 'session-id',
        name: '工作',
        createdAt: '2026-09-30T00:00:00.000Z',
        windows: [{ tabs: [{ url: 'https://example.test', title: 'Example' }] }],
      },
    })
    expect(dependencies.store.addSession).toHaveBeenCalledOnce()
  })

  it('returns the normalized session name that is persisted', async () => {
    const dependencies = makeDependencies()

    await expect(
      handleMessage({ type: 'save-session', name: '  工作  ', scope: 'current-window' }, dependencies),
    ).resolves.toMatchObject({ ok: true, session: { name: '工作' } })
  })

  it('rejects a capture with no restorable tabs without writing a session', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.windowsApi.getCurrent).mockResolvedValue({
      type: 'normal',
      incognito: false,
      tabs: [{ url: 'chrome://settings', title: 'Settings' }],
    })

    await expect(
      handleMessage({ type: 'save-session', name: '无效', scope: 'current-window' }, dependencies),
    ).resolves.toEqual({
      ok: false,
      code: 'no-restorable-tabs',
      message: '没有可保存的 HTTP(S) 标签页',
      excludedTabs: [{ url: 'chrome://settings', title: 'Settings', reason: 'unsupported-url' }],
    })
    expect(dependencies.store.addSession).not.toHaveBeenCalled()
  })

  it('rejects an empty preview before issuing a confirmation token', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.windowsApi.getCurrent).mockResolvedValue({
      type: 'normal',
      tabs: [],
    })

    await expect(
      handleMessage({ type: 'preview-session', scope: 'current-window' }, dependencies),
    ).resolves.toEqual({
      ok: false,
      code: 'no-restorable-tabs',
      message: '没有可保存的 HTTP(S) 标签页',
      excludedTabs: [],
    })
  })

  it('returns an exclusion preview before saving a mixed capture', async () => {
    const dependencies = makeDependencies()
    vi.mocked(dependencies.windowsApi.getCurrent).mockResolvedValue({
      type: 'normal',
      incognito: false,
      tabs: [
        { url: 'https://example.test', title: 'Example' },
        { url: 'chrome://settings', title: 'Settings' },
      ],
    })

    await expect(
      handleMessage({ type: 'save-session', name: '需确认', scope: 'current-window' }, dependencies),
    ).resolves.toMatchObject({
      ok: false,
      code: 'confirmation-required',
      message: '有标签页无法保存，请确认后继续',
      preview: { includedTabCount: 1, excludedTabs: [{ reason: 'unsupported-url' }] },
      previewToken: expect.any(String),
    })
    expect(dependencies.store.addSession).not.toHaveBeenCalled()
  })

  it('returns a structured failure for an invalid message', async () => {
    await expect(handleMessage({ type: 'unknown' }, makeDependencies())).resolves.toEqual({
      ok: false,
      code: 'invalid-message',
      message: '无法识别的后台消息',
    })
  })

  it('saves a confirmed preview without collecting the browser again', async () => {
    const dependencies = makeDependencies()
    const preview = await handleMessage(
      { type: 'preview-session', scope: 'current-window' },
      dependencies,
    )
    if (!preview.ok || !('preview' in preview)) throw new Error('expected preview')
    const readsBeforeSave = vi.mocked(dependencies.windowsApi.getCurrent).mock.calls.length

    await expect(
      handleMessage(
        {
          type: 'save-session',
          name: '确认保存',
          scope: 'current-window',
          confirm: true,
          previewToken: preview.previewToken,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ ok: true, session: { name: '确认保存' } })
    expect(dependencies.windowsApi.getCurrent).toHaveBeenCalledTimes(readsBeforeSave)
  })

  it('does not accept a client-supplied capture snapshot', async () => {
    const dependencies = makeDependencies()

    await expect(
      handleMessage(
        {
          type: 'save-session',
          name: '伪造',
          scope: 'current-window',
          confirm: true,
          capture: {
            windows: [{ tabs: [{ url: 'https://unrelated.example', title: '外部标签' }] }],
            includedTabCount: 999,
            excludedTabs: [],
          },
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'preview-expired' })
    expect(dependencies.store.addSession).not.toHaveBeenCalled()
  })

  it('maps preview storage failures to a storage error', async () => {
    const dependencies = makeDependencies()
    const failingCache: PreviewCache = {
      put: vi.fn(async () => {
        throw new StorageAccessError('写入预览缓存失败')
      }),
      claim: vi.fn(),
      release: vi.fn(),
      complete: vi.fn(),
    }
    dependencies.previewCache = failingCache

    await expect(
      handleMessage({ type: 'preview-session', scope: 'current-window' }, dependencies),
    ).resolves.toEqual({ ok: false, code: 'storage-error', message: '写入预览缓存失败' })
  })

  it('releases a preview after a failed write so confirmation can be retried', async () => {
    const dependencies = makeDependencies()
    const preview = await handleMessage(
      { type: 'preview-session', scope: 'current-window' },
      dependencies,
    )
    if (!preview.ok || !('preview' in preview)) throw new Error('expected preview')

    vi.mocked(dependencies.store.addSession).mockRejectedValueOnce(new StorageAccessError('写入本地会话失败'))
    await expect(
      handleMessage(
        {
          type: 'save-session',
          name: '重试',
          scope: 'current-window',
          confirm: true,
          previewToken: preview.previewToken,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ ok: false, code: 'storage-error' })

    await expect(
      handleMessage(
        {
          type: 'save-session',
          name: '重试',
          scope: 'current-window',
          confirm: true,
          previewToken: preview.previewToken,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ ok: true, session: { name: '重试' } })
  })

  it('routes list, rename, and delete requests through the store', async () => {
    const dependencies = makeDependencies()

    await expect(handleMessage({ type: 'list-sessions' }, dependencies)).resolves.toEqual({ ok: true, sessions: [] })
    await expect(handleMessage({ type: 'rename-session', id: 'id', name: '新名称' }, dependencies)).resolves.toEqual({
      ok: true,
    })
    await expect(handleMessage({ type: 'delete-session', id: 'id' }, dependencies)).resolves.toEqual({ ok: true })
    expect(dependencies.store.renameSession).toHaveBeenCalledWith('id', '新名称')
    expect(dependencies.store.deleteSession).toHaveBeenCalledWith('id')
  })

  it('exports a backup and imports it only after preview confirmation', async () => {
    const dependencies = makeDependencies()
    const session: SavedSession = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: '备份会话',
      createdAt: '2026-09-30T00:00:00.000Z',
      windows: [{ tabs: [{ url: 'https://backup.test', title: 'Backup' }] }],
    }
    vi.mocked(dependencies.store.loadState).mockResolvedValue({ sessions: [session] })

    const exported = await handleMessage({ type: 'export-backup' }, dependencies)
    expect(exported).toMatchObject({ ok: true, document: { schemaVersion: 1, sessions: [session] } })

    const preview = await handleMessage({ type: 'preview-import', document: { ok: true } }, dependencies)
    expect(preview).toMatchObject({ ok: false, code: 'invalid-backup', errors: expect.any(Array) })

    const document = { schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [session] }
    const validPreview = await handleMessage({ type: 'preview-import', document }, { ...dependencies, store: makeStore() })
    expect(validPreview).toMatchObject({ ok: true, validation: { valid: true } })
    if (!validPreview.ok || !('previewToken' in validPreview)) throw new Error('expected import preview')

    const target = makeDependencies()
    const result = await handleMessage({ type: 'import-backup', previewToken: validPreview.previewToken, document }, target)
    expect(result).toEqual({ ok: true, addedSessionCount: 1, skippedSessionCount: 0 })
    expect(target.store.importSessions).toHaveBeenCalledWith([session])
  })

  it('imports an exported backup larger than 2 MB after preview confirmation', async () => {
    const source = makeDependencies()
    const session: SavedSession = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Large',
      createdAt: '2026-09-30T00:00:00.000Z',
      windows: [{ tabs: [{ url: 'https://example.test', title: 'x'.repeat(2 * 1024 * 1024) }] }],
    }
    vi.mocked(source.store.loadState).mockResolvedValue({ sessions: [session] })
    const exported = await handleMessage({ type: 'export-backup' }, source)
    if (!exported.ok || !('document' in exported)) throw new Error('expected export')

    const target = makeDependencies()
    const preview = await handleMessage({ type: 'preview-import', document: exported.document }, target)
    if (!preview.ok || !('previewToken' in preview)) throw new Error('expected preview')

    await expect(handleMessage({ type: 'import-backup', previewToken: preview.previewToken, document: exported.document }, target))
      .resolves.toMatchObject({ ok: true, addedSessionCount: 1 })
    expect(target.store.importSessions).toHaveBeenCalledWith([session])
  })

  it('keeps an import preview retryable when the storage write fails', async () => {
    const backupPreviewCache = new MemoryBackupPreviewCache()
    const document = {
      schemaVersion: 1 as const,
      exportedAt: '2026-09-30T00:00:00.000Z',
      sessions: [{
        id: '123e4567-e89b-42d3-a456-426614174000',
        name: '备份会话',
        createdAt: '2026-09-30T00:00:00.000Z',
        windows: [{ tabs: [{ url: 'https://backup.test', title: 'Backup' }] }],
      }],
    }
    const source = { ...makeDependencies(), backupPreviewCache }
    const preview = await handleMessage({ type: 'preview-import', document }, source)
    if (!preview.ok || !('previewToken' in preview)) throw new Error('expected import preview')

    const target = makeDependencies()
    target.backupPreviewCache = backupPreviewCache
    target.store.importSessions = vi.fn(async () => {
      throw new StorageAccessError('写入本地会话失败')
    })

    await expect(handleMessage({ type: 'import-backup', previewToken: preview.previewToken, document }, target)).resolves.toMatchObject({
      ok: false,
      code: 'storage-error',
    })
    await expect(handleMessage({ type: 'import-backup', previewToken: preview.previewToken, document }, target)).resolves.toMatchObject({
      ok: false,
      code: 'storage-error',
    })
    expect(await target.store.loadState()).toEqual({ schemaVersion: 1, sessions: [] })
  })
})
