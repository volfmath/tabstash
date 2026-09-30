import { captureSession, type CapturedSession, type WindowsApi } from '../lib/session-capture'
import {
  createRestorePlan,
  createRunningRestoreTask,
  executeRestorePlan,
  type RestoreBrowserApi,
  type RestoreTask,
} from '../lib/restore'
import { SessionRestoreTaskStore, type RestoreTaskStoreApi } from './restore-tasks'
import { MemoryBackupPreviewCache, SessionBackupPreviewCache, type BackupPreviewCache } from './backup-previews'
import { createBackupDocument, validateBackup, type BackupDocument } from '../lib/backup'
import {
  InvalidSessionNameError,
  SessionNotFoundError,
  SessionStore,
  StorageAccessError,
  StorageLimitError,
  StorageValidationError,
  createChromeStorage,
  type StorageLike,
} from '../lib/storage'
import type { SavedSession } from '../types/session'
import {
  type BackgroundMessage,
  type BackgroundResponse,
  type ListSessionsSuccess,
  type MessageFailure,
  type PreviewSessionSuccess,
  type SaveSessionSuccess,
  isBackgroundMessage,
} from './messages'

const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 20
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024

interface PreviewRecord {
  capture: CapturedSession
  scope: Extract<BackgroundMessage, { type: 'save-session' }>['scope']
  expiresAt: number
  claimedAt?: number
  size: number
}

export interface PreviewCache {
  put(capture: CapturedSession, scope: PreviewRecord['scope']): Promise<string>
  claim(token: string, scope: PreviewRecord['scope']): Promise<CapturedSession | undefined>
  release(token: string, capture: CapturedSession, scope: PreviewRecord['scope']): Promise<void>
  complete(token: string): Promise<void>
}

export class MemoryPreviewCache implements PreviewCache {
  private readonly records = new Map<string, PreviewRecord>()

  async put(capture: CapturedSession, scope: PreviewRecord['scope']): Promise<string> {
    const size = previewSize(capture)
    this.prune()
    while (this.records.size >= MAX_PREVIEWS || this.totalSize() + size > MAX_PREVIEW_BYTES) this.evictOldest()
    const token = crypto.randomUUID()
    this.records.set(token, { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS, size })
    return token
  }

  async claim(token: string, scope: PreviewRecord['scope']): Promise<CapturedSession | undefined> {
    this.prune()
    const record = this.records.get(token)
    if (
      !record ||
      record.scope !== scope ||
      record.claimedAt !== undefined
    ) {
      return undefined
    }
    record.claimedAt = Date.now()
    return record.capture
  }

  async release(token: string, capture: CapturedSession, scope: PreviewRecord['scope']): Promise<void> {
    this.records.set(token, { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS, size: previewSize(capture) })
  }

  async complete(token: string): Promise<void> {
    this.records.delete(token)
  }

  private prune(): void {
    const now = Date.now()
    for (const [token, record] of this.records) {
      if (record.expiresAt < now) this.records.delete(token)
    }
  }

  private totalSize(): number {
    return [...this.records.values()].reduce((total, record) => total + record.size, 0)
  }

  private evictOldest(): void {
      const oldest = [...this.records.entries()].sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
      if (!oldest) return
      this.records.delete(oldest[0])
  }
}

const PREVIEW_STORAGE_KEY = 'tabstashPreviewCache'

export class SessionPreviewCache implements PreviewCache {
  constructor(private readonly storage: StorageLike) {}

  put(capture: CapturedSession, scope: PreviewRecord['scope']): Promise<string> {
    return enqueuePreviewOperation(async () => {
      const records = await this.readRecords()
      const now = Date.now()
      pruneRecords(records, now)
      const size = previewSize(capture)
      while (Object.keys(records).length >= MAX_PREVIEWS || totalPreviewSize(records) + size > MAX_PREVIEW_BYTES) {
        evictOldestRecord(records)
      }
      const token = crypto.randomUUID()
      records[token] = { capture, scope, expiresAt: now + PREVIEW_TTL_MS, size }
      await this.writeRecords(records)
      return token
    })
  }

  claim(token: string, scope: PreviewRecord['scope']): Promise<CapturedSession | undefined> {
    return enqueuePreviewOperation(async () => {
      const records = await this.readRecords()
      const now = Date.now()
      pruneRecords(records, now)
      const record = records[token]
      if (
        !record ||
        record.scope !== scope ||
        record.claimedAt !== undefined
      ) {
        await this.writeRecords(records)
        return undefined
      }
      record.claimedAt = now
      await this.writeRecords(records)
      return record.capture
    })
  }

  release(token: string, capture: CapturedSession, scope: PreviewRecord['scope']): Promise<void> {
    return enqueuePreviewOperation(async () => {
      const records = await this.readRecords()
      pruneRecords(records, Date.now())
      const size = previewSize(capture)
      records[token] = { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS, size }
      while (Object.keys(records).length > MAX_PREVIEWS || totalPreviewSize(records) > MAX_PREVIEW_BYTES) evictOldestRecord(records)
      await this.writeRecords(records)
    })
  }

  complete(token: string): Promise<void> {
    return enqueuePreviewOperation(async () => {
      const records = await this.readRecords()
      delete records[token]
      await this.writeRecords(records)
    })
  }

  private async readRecords(): Promise<Record<string, PreviewRecord>> {
    try {
      const result = await this.storage.get(PREVIEW_STORAGE_KEY)
      const value = result[PREVIEW_STORAGE_KEY]
      return isRecord(value) ? ({ ...value } as unknown as Record<string, PreviewRecord>) : {}
    } catch (error) {
      throw new StorageAccessError('读取预览缓存失败', { cause: error })
    }
  }

  private async writeRecords(records: Record<string, PreviewRecord>): Promise<void> {
    try {
      await this.storage.set({ [PREVIEW_STORAGE_KEY]: records })
    } catch (error) {
      throw new StorageAccessError('写入预览缓存失败', { cause: error })
    }
  }
}

let previewOperationQueue: Promise<void> = Promise.resolve()

function enqueuePreviewOperation<T>(operation: () => Promise<T>): Promise<T> {
  const task = previewOperationQueue.then(operation, operation)
  previewOperationQueue = task.then(() => undefined, () => undefined)
  return task
}

function pruneRecords(records: Record<string, PreviewRecord>, now: number): void {
  for (const [token, record] of Object.entries(records)) {
    if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt < now) {
      delete records[token]
    }
  }
}

function previewSize(value: unknown): number {
  const size = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (size > MAX_PREVIEW_BYTES) throw new StorageAccessError('保存预览超过 5 MB 临时缓存上限')
  return size
}

function totalPreviewSize(records: Record<string, PreviewRecord>): number {
  return Object.values(records).reduce((total, record) => total + (record.size ?? previewSize(record.capture)), 0)
}

function evictOldestRecord(records: Record<string, PreviewRecord>): void {
  const oldest = Object.entries(records).sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
  if (oldest) delete records[oldest[0]]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const defaultPreviewCache = new MemoryPreviewCache()
const defaultBackupPreviewCache = new MemoryBackupPreviewCache()

export interface SessionStoreLike {
  loadState(): Promise<{ sessions: SavedSession[] }>
  addSession(session: SavedSession): Promise<{ sessions: SavedSession[] }>
  importSessions?(sessions: SavedSession[]): Promise<{ addedSessionCount: number; skippedSessionCount: number }>
  renameSession(id: string, name: string): Promise<unknown>
  deleteSession(id: string): Promise<unknown>
}

export interface BackgroundDependencies {
  store: SessionStoreLike
  windowsApi: WindowsApi
  createId: () => string
  now: () => Date
  previewCache?: PreviewCache
  restoreApi?: RestoreBrowserApi
  restoreTaskStore?: RestoreTaskStoreApi
  activeRestoreTasks?: Set<string>
  backupPreviewCache?: BackupPreviewCache
}

class RestoreUnavailableError extends Error {
  constructor() {
    super('恢复服务不可用')
    this.name = 'RestoreUnavailableError'
  }
}

class RestoreBusyError extends Error {
  constructor() {
    super('已有恢复任务正在运行，请等待其结束')
    this.name = 'RestoreBusyError'
  }
}

class RestoreTaskNotFoundError extends Error {
  constructor(id: string) {
    super(`找不到恢复任务: ${id}`)
    this.name = 'RestoreTaskNotFoundError'
  }
}

export async function handleMessage(
  message: unknown,
  dependencies: BackgroundDependencies,
): Promise<BackgroundResponse> {
  if (!isBackgroundMessage(message)) {
    return { ok: false, code: 'invalid-message', message: '无法识别的后台消息' }
  }

  try {
    switch (message.type) {
      case 'save-session':
        return await saveSession(message, dependencies)
      case 'preview-session':
        return await previewSession(message.scope, dependencies)
      case 'list-sessions':
        return await listSessions(dependencies)
      case 'rename-session':
        await dependencies.store.renameSession(message.id, message.name)
        return { ok: true }
      case 'delete-session':
        await dependencies.store.deleteSession(message.id)
        return { ok: true }
      case 'restore-session':
        return await enqueueRestoreStart(() => startRestore(message.id, message.mode, message.requestId, dependencies))
      case 'get-restore-task': {
        const taskStore = dependencies.restoreTaskStore
        if (!taskStore) throw new RestoreUnavailableError()
        const task = await taskStore.get(message.taskId)
        if (!task) throw new RestoreTaskNotFoundError(message.taskId)
        return { ok: true, task }
      }
      case 'list-restore-tasks': {
        const taskStore = dependencies.restoreTaskStore
        if (!taskStore) throw new RestoreUnavailableError()
        return { ok: true, tasks: await taskStore.list() }
      }
      case 'export-backup':
        return await exportBackup(dependencies)
      case 'preview-import':
        return await previewImport(message.document, dependencies)
      case 'import-backup':
        return await importBackup(message.previewToken, message.document, dependencies)
    }
  } catch (error) {
    return toFailure(error)
  }
}

async function exportBackup(dependencies: BackgroundDependencies) {
  const state = await dependencies.store.loadState()
  return { ok: true as const, document: createBackupDocument(state.sessions) }
}

async function previewImport(document: unknown, dependencies: BackgroundDependencies) {
  const state = await dependencies.store.loadState()
  const validation = validateBackup(document, state.sessions)
  if (!validation.valid) {
    return {
      ok: false as const,
      code: 'invalid-backup' as const,
      message: validation.errors.join('；'),
      errors: validation.errors,
      details: validation.details,
    }
  }
  const previewToken = await (dependencies.backupPreviewCache ?? defaultBackupPreviewCache).put(document as import('../lib/backup').BackupDocument)
  return { ok: true as const, validation, previewToken }
}

async function importBackup(previewToken: string, document: unknown, dependencies: BackgroundDependencies) {
  const cache = dependencies.backupPreviewCache ?? defaultBackupPreviewCache
  if (!await cache.claim(previewToken, document)) {
    return { ok: false as const, code: 'backup-preview-expired' as const, message: '导入预览已过期或文件已变化，请重新选择文件' }
  }
  let imported = false
  try {
    const state = await dependencies.store.loadState()
    const validation = validateBackup(document, state.sessions)
    if (!validation.valid) {
      return {
        ok: false as const,
        code: 'invalid-backup' as const,
        message: validation.errors.join('；'),
        errors: validation.errors,
        details: validation.details,
      }
    }
    if (!dependencies.store.importSessions) throw new StorageAccessError('导入服务不可用')
    const result = await dependencies.store.importSessions((document as BackupDocument).sessions)
    imported = true
    return {
      ok: true as const,
      addedSessionCount: result.addedSessionCount,
      skippedSessionCount: result.skippedSessionCount,
    }
  } finally {
    if (imported) {
      await cache.complete(previewToken).catch(() => undefined)
    } else {
      await cache.release(previewToken).catch(() => undefined)
    }
  }
}

async function startRestore(
  sessionId: string,
  mode: 'preserve-windows' | 'merge-window',
  requestId: string,
  dependencies: BackgroundDependencies,
) {
  if (!dependencies.restoreApi || !dependencies.restoreTaskStore) throw new RestoreUnavailableError()
  const existing = await dependencies.restoreTaskStore.get(requestId)
  if (existing) {
    if (existing.sessionId !== sessionId || existing.mode !== mode) {
      return { ok: false as const, code: 'invalid-message' as const, message: '恢复请求 ID 已用于其他会话或模式' }
    }
    return { ok: true as const, task: existing }
  }
  const existingTasks = await dependencies.restoreTaskStore.list()
  if (existingTasks.some((task) => task.status === 'running')) throw new RestoreBusyError()
  const state = await dependencies.store.loadState()
  const session = state.sessions.find((candidate) => candidate.id === sessionId)
  if (!session) throw new SessionNotFoundError(sessionId)

  const plan = createRestorePlan(session, mode, dependencies.createId)
  const task = createRunningRestoreTask(plan, requestId, dependencies.now().getTime())
  await dependencies.restoreTaskStore.save(task)
  dependencies.activeRestoreTasks?.add(task.id)
  void executeRestorePlan(
    plan,
    dependencies.restoreApi,
    dependencies.restoreTaskStore,
    dependencies.createId,
    () => dependencies.now().getTime(),
    task,
  ).catch(async (error: unknown) => {
    task.status = 'unconfirmed'
    task.updatedAt = dependencies.now().toISOString()
    task.failures = [...task.failures, {
      url: '',
      title: '恢复任务',
      message: error instanceof Error ? error.message : '恢复任务意外中断',
    }]
    try {
      await dependencies.restoreTaskStore?.save(task)
    } catch {
      // The task may be unavailable after a storage failure; do not retry browser operations.
    }
  }).finally(() => {
    dependencies.activeRestoreTasks?.delete(task.id)
  })
  return { ok: true as const, task }
}

let restoreStartQueue: Promise<void> = Promise.resolve()

function enqueueRestoreStart<T>(operation: () => Promise<T>): Promise<T> {
  const task = restoreStartQueue.then(operation, operation)
  restoreStartQueue = task.then(() => undefined, () => undefined)
  return task
}

async function saveSession(
  message: Extract<BackgroundMessage, { type: 'save-session' }>,
  dependencies: BackgroundDependencies,
): Promise<SaveSessionSuccess | MessageFailure> {
  const previewCache = dependencies.previewCache ?? defaultPreviewCache
  const normalizedName = message.name.trim()
  if (!normalizedName) return toFailure(new InvalidSessionNameError())

  const claimedToken = message.confirm ? message.previewToken : undefined
  const captured = message.confirm
    ? claimedToken
      ? await previewCache.claim(claimedToken, message.scope)
      : undefined
    : await captureSession(message.scope, dependencies.windowsApi)
  if (!captured) {
    return {
      ok: false,
      code: 'preview-expired',
      message: '保存预览已过期，请重新预览',
    }
  }
  if (captured.includedTabCount === 0) {
    if (claimedToken) {
      try {
        await previewCache.release(claimedToken, captured, message.scope)
      } catch {
        // Keep the user-facing result deterministic; the claim will expire.
      }
    }
    return {
      ok: false,
      code: 'no-restorable-tabs',
      message: '没有可保存的 HTTP(S) 标签页',
      excludedTabs: captured.excludedTabs,
    }
  }
  if (captured.excludedTabs.length > 0 && message.confirm !== true) {
    const previewToken = await previewCache.put(captured, message.scope)
    return {
      ok: false,
      code: 'confirmation-required',
      message: '有标签页无法保存，请确认后继续',
      preview: captured,
      previewToken,
    }
  }

  const session: SavedSession = {
    id: dependencies.createId(),
    name: normalizedName,
    createdAt: dependencies.now().toISOString(),
    windows: captured.windows,
  }
  let persisted: { sessions: SavedSession[] }
  try {
    persisted = await dependencies.store.addSession(session)
  } catch (error) {
    if (claimedToken) {
      try {
        await previewCache.release(claimedToken, captured, message.scope)
      } catch {
        // Preserve the original session write failure; the claim has a short TTL.
      }
    }
    throw error
  }
  if (claimedToken) {
    try {
      await previewCache.complete(claimedToken)
    } catch {
      // The session is already durable; the claimed token will expire naturally.
    }
  }
  const savedSession = persisted.sessions.find((item) => item.id === session.id) ?? session

  return {
    ok: true,
    session: savedSession,
    includedTabCount: captured.includedTabCount,
    excludedTabs: captured.excludedTabs,
  }
}

async function previewSession(
  scope: Extract<BackgroundMessage, { type: 'preview-session' }>['scope'],
  dependencies: BackgroundDependencies,
): Promise<PreviewSessionSuccess | MessageFailure> {
  const preview = await captureSession(scope, dependencies.windowsApi)
  if (preview.includedTabCount === 0) {
    return {
      ok: false,
      code: 'no-restorable-tabs',
      message: '没有可保存的 HTTP(S) 标签页',
      excludedTabs: preview.excludedTabs,
    }
  }
  const previewToken = await (dependencies.previewCache ?? defaultPreviewCache).put(preview, scope)
  return { ok: true, preview, previewToken }
}

async function listSessions(dependencies: BackgroundDependencies): Promise<ListSessionsSuccess> {
  const state = await dependencies.store.loadState()
  return { ok: true, sessions: state.sessions }
}

function toFailure(error: unknown): MessageFailure {
  if (error instanceof InvalidSessionNameError) {
    return { ok: false, code: 'invalid-name', message: error.message }
  }
  if (error instanceof StorageLimitError) {
    return { ok: false, code: 'limit-reached', message: error.message }
  }
  if (error instanceof SessionNotFoundError) {
    return { ok: false, code: 'session-not-found', message: error.message }
  }
  if (error instanceof StorageValidationError) {
    return { ok: false, code: 'invalid-storage', message: error.message }
  }
  if (error instanceof StorageAccessError) {
    return { ok: false, code: 'storage-error', message: error.message }
  }
  if (error instanceof RestoreUnavailableError) {
    return { ok: false, code: 'restore-unavailable', message: error.message }
  }
  if (error instanceof RestoreBusyError) {
    return { ok: false, code: 'restore-busy', message: error.message }
  }
  if (error instanceof RestoreTaskNotFoundError) {
    return { ok: false, code: 'restore-task-not-found', message: error.message }
  }
  return { ok: false, code: 'unknown-error', message: '操作失败，请稍后重试' }
}

export function createBackgroundDependencies(): BackgroundDependencies {
  if (typeof chrome === 'undefined' || !chrome.windows) {
    throw new StorageAccessError('Chrome 窗口 API 不可用')
  }

  const windowsApi: WindowsApi = {
    getCurrent: (options) => chrome.windows.getCurrent(options),
    getAll: (options) =>
      chrome.windows.getAll({
        ...options,
        windowTypes: options.windowTypes as chrome.windows.windowTypeEnum[],
      }),
  }

  const activeRestoreTasks = new Set<string>()
  return {
    store: new SessionStore(createChromeStorage()),
    windowsApi,
    createId: () => crypto.randomUUID(),
    now: () => new Date(),
    previewCache: chrome.storage.session
      ? new SessionPreviewCache(chrome.storage.session)
      : (() => {
          throw new StorageAccessError('Chrome 临时会话存储不可用')
        })(),
    restoreTaskStore: new SessionRestoreTaskStore(chrome.storage.session, Date.now, (id) => activeRestoreTasks.has(id)),
    activeRestoreTasks,
    backupPreviewCache: new SessionBackupPreviewCache(chrome.storage.session),
    restoreApi: {
      createWindow: async (url) => chrome.windows.create({ ...(url ? { url } : {}), type: 'normal' }),
      createTab: async ({ windowId, url }) => chrome.tabs.create({ windowId, url }),
    },
  }
}
