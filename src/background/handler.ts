import { captureSession, type CapturedSession, type WindowsApi } from '../lib/session-capture'
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

interface PreviewRecord {
  capture: CapturedSession
  scope: Extract<BackgroundMessage, { type: 'save-session' }>['scope']
  expiresAt: number
  claimedAt?: number
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
    this.prune()
    this.trimToLimit()
    const token = crypto.randomUUID()
    this.records.set(token, { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS })
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
    this.records.set(token, { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS })
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

  private trimToLimit(): void {
    while (this.records.size >= MAX_PREVIEWS) {
      const oldest = [...this.records.entries()].sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
      if (!oldest) return
      this.records.delete(oldest[0])
    }
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
      trimRecordsToLimit(records)
      const token = crypto.randomUUID()
      records[token] = { capture, scope, expiresAt: now + PREVIEW_TTL_MS }
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
      records[token] = { capture, scope, expiresAt: Date.now() + PREVIEW_TTL_MS }
      trimRecordsToLimit(records)
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

function trimRecordsToLimit(records: Record<string, PreviewRecord>): void {
  while (Object.keys(records).length >= MAX_PREVIEWS) {
    const oldest = Object.entries(records).sort(([, left], [, right]) => left.expiresAt - right.expiresAt)[0]
    if (!oldest) return
    delete records[oldest[0]]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const defaultPreviewCache = new MemoryPreviewCache()

export interface SessionStoreLike {
  loadState(): Promise<{ sessions: SavedSession[] }>
  addSession(session: SavedSession): Promise<{ sessions: SavedSession[] }>
  renameSession(id: string, name: string): Promise<unknown>
  deleteSession(id: string): Promise<unknown>
}

export interface BackgroundDependencies {
  store: SessionStoreLike
  windowsApi: WindowsApi
  createId: () => string
  now: () => Date
  previewCache?: PreviewCache
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
    }
  } catch (error) {
    return toFailure(error)
  }
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
  }
}
