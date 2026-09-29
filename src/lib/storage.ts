import { isRestorableUrl } from './url'
import {
  MAX_SESSIONS,
  SCHEMA_VERSION,
  type SavedSession,
  type SavedTab,
  type SavedWindow,
  type StoredState,
} from '../types/session'

export const STORAGE_KEY = 'tabstashState'
export { MAX_SESSIONS }

export interface StorageLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageValidationError'
  }
}

export class StorageAccessError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StorageAccessError'
  }
}

export class StorageLimitError extends Error {
  constructor() {
    super('最多保存 5 个会话')
    this.name = 'StorageLimitError'
  }
}

export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`找不到会话: ${id}`)
    this.name = 'SessionNotFoundError'
  }
}

export class InvalidSessionNameError extends Error {
  constructor() {
    super('会话名称不能为空')
    this.name = 'InvalidSessionNameError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSavedTab(value: unknown): value is SavedTab {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    isRestorableUrl(value.url) &&
    typeof value.title === 'string'
  )
}

function isSavedWindow(value: unknown): value is SavedWindow {
  return isRecord(value) && Array.isArray(value.tabs) && value.tabs.every(isSavedTab)
}

function isSavedSession(value: unknown): value is SavedSession {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isUuid(value.id) &&
    typeof value.name === 'string' &&
    value.name.trim() !== '' &&
    typeof value.createdAt === 'string' &&
    isIsoTimestamp(value.createdAt) &&
    Array.isArray(value.windows) &&
    value.windows.every(isSavedWindow) &&
    value.windows.some((window) => window.tabs.length > 0)
  )
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

export function validateStoredState(value: unknown): StoredState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > MAX_SESSIONS ||
    !value.sessions.every(isSavedSession)
  ) {
    throw new StorageValidationError('本地会话数据格式无效或版本不受支持')
  }

  const ids = new Set(value.sessions.map((session) => session.id))
  if (ids.size !== value.sessions.length) {
    throw new StorageValidationError('本地会话数据包含重复 ID')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: value.sessions,
  }
}

function emptyState(): StoredState {
  return { schemaVersion: SCHEMA_VERSION, sessions: [] }
}

function normalizeName(name: string): string {
  const normalized = name.trim()
  if (!normalized) throw new InvalidSessionNameError()
  return normalized
}

export class SessionStore {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly storage: StorageLike) {}

  async loadState(): Promise<StoredState> {
    await this.writeQueue
    return this.readState()
  }

  private async readState(): Promise<StoredState> {
    let result: Record<string, unknown>
    try {
      result = await this.storage.get(STORAGE_KEY)
    } catch (error) {
      throw new StorageAccessError('读取本地会话失败', { cause: error })
    }

    const value = result[STORAGE_KEY]
    return value === undefined ? emptyState() : validateStoredState(value)
  }

  async addSession(session: SavedSession): Promise<StoredState> {
    return this.enqueue(async () => {
      const current = await this.readState()
      if (current.sessions.length >= MAX_SESSIONS) throw new StorageLimitError()
      if (current.sessions.some((existing) => existing.id === session.id)) {
        throw new StorageValidationError('本地会话数据包含重复 ID')
      }

      const candidate: StoredState = {
        schemaVersion: SCHEMA_VERSION,
        sessions: [...current.sessions, { ...session, name: normalizeName(session.name) }],
      }
      if (session.windows.every((window) => window.tabs.length === 0)) {
        throw new StorageValidationError('会话必须至少包含一个可恢复标签页')
      }
      validateStoredState(candidate)
      return this.persist(candidate)
    })
  }

  async renameSession(id: string, name: string): Promise<StoredState> {
    return this.enqueue(async () => {
      const current = await this.readState()
      if (!current.sessions.some((session) => session.id === id)) throw new SessionNotFoundError(id)

      const candidate: StoredState = {
        schemaVersion: SCHEMA_VERSION,
        sessions: current.sessions.map((session) =>
          session.id === id ? { ...session, name: normalizeName(name) } : session,
        ),
      }
      return this.persist(candidate)
    })
  }

  async deleteSession(id: string): Promise<StoredState> {
    return this.enqueue(async () => {
      const current = await this.readState()
      if (!current.sessions.some((session) => session.id === id)) throw new SessionNotFoundError(id)

      return this.persist({
        schemaVersion: SCHEMA_VERSION,
        sessions: current.sessions.filter((session) => session.id !== id),
      })
    })
  }

  private persist(candidate: StoredState): Promise<StoredState> {
    return this.storage
      .set({ [STORAGE_KEY]: candidate })
      .then(() => candidate)
      .catch(async (error: unknown) => {
        try {
          await this.readState()
        } catch {
          // Preserve the original write failure as the actionable error.
        }
        throw new StorageAccessError('写入本地会话失败', { cause: error })
      })
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.writeQueue.then(operation, operation)
    this.writeQueue = task.then(
      () => undefined,
      () => undefined,
    )
    return task
  }
}

export function createChromeStorage(): StorageLike {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new StorageAccessError('Chrome 本地存储不可用')
  }
  return chrome.storage.local
}
