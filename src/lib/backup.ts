import { MAX_SESSIONS, validateStoredState } from './storage'
import { SCHEMA_VERSION, type SavedSession } from '../types/session'

export interface BackupDocument {
  schemaVersion: typeof SCHEMA_VERSION
  exportedAt: string
  sessions: SavedSession[]
}

export interface BackupValidation {
  valid: boolean
  errors: string[]
  details: BackupValidationDetail[]
  sessionsToAdd: SavedSession[]
  skippedSessionCount: number
  totalSessionCount: number
}

export type BackupValidationDetailCode =
  | 'invalid-field'
  | 'duplicate-id'
  | 'unknown-field'
  | 'unsupported-version'
  | 'too-many-sessions'
  | 'capacity-exceeded'

export interface BackupValidationDetail {
  code: BackupValidationDetailCode
  index?: number
  field?: string
}

export function createBackupDocument(sessions: SavedSession[], now = Date.now): BackupDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now()).toISOString(),
    sessions: sessions.map((session) => ({
      ...session,
      windows: session.windows.map((window) => ({ tabs: window.tabs.map((tab) => ({ ...tab })) })),
    })),
  }
}

export function validateBackup(input: unknown, existingSessions: SavedSession[] = []): BackupValidation {
  const errors: string[] = []
  const details: BackupValidationDetail[] = []
  if (!isRecord(input)) return invalid(['备份文件必须是 JSON 对象'], 0, [{ code: 'invalid-field', field: 'document' }])
  const unknownFields = Object.keys(input).filter((key) => !['schemaVersion', 'exportedAt', 'sessions'].includes(key))
  if (unknownFields.length > 0) {
    errors.push('备份文件包含未知字段')
    details.push(...unknownFields.map((field) => ({ code: 'unknown-field' as const, field })))
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    errors.push('备份版本不受支持')
    details.push({ code: 'unsupported-version' })
  }
  if (!isIsoTimestamp(input.exportedAt)) {
    errors.push('备份导出时间无效')
    details.push({ code: 'invalid-field', field: 'exportedAt' })
  }
  if (!Array.isArray(input.sessions)) {
    errors.push('备份会话列表无效')
    details.push({ code: 'invalid-field', field: 'sessions' })
  }
  if (errors.length > 0 || !Array.isArray(input.sessions)) return invalid(errors, 0, details)
  if (input.sessions.length > MAX_SESSIONS) {
    return invalid(['备份文件包含超过 5 个会话'], 0, [{ code: 'too-many-sessions' }])
  }

  const sessions: SavedSession[] = []
  const seenIds = new Set<string>()
  for (const [index, value] of input.sessions.entries()) {
    if (!isRecord(value)) {
      errors.push(`第 ${index + 1} 个会话格式无效`)
      details.push({ code: 'invalid-field', index: index + 1, field: 'session' })
      continue
    }
    const id = typeof value.id === 'string' ? value.id : ''
    const idKey = id.toLowerCase()
    if (id && seenIds.has(idKey)) {
      errors.push(`备份文件包含重复会话 ID: ${id}`)
      details.push({ code: 'duplicate-id', index: index + 1, field: 'id' })
      continue
    }
    if (id) seenIds.add(idKey)
    try {
      const validated = validateStoredState({ schemaVersion: SCHEMA_VERSION, sessions: [value] })
      sessions.push(validated.sessions[0])
    } catch {
      errors.push(`第 ${index + 1} 个会话包含无效字段、时间或网址`)
      const field = invalidSessionField(value)
      details.push({ code: 'invalid-field', index: index + 1, ...(field ? { field } : {}) })
    }
  }
  if (errors.length > 0) return invalid(errors, 0, details)

  const existingIds = new Set(existingSessions.map((session) => session.id.toLowerCase()))
  const sessionsToAdd = sessions.filter((session) => !existingIds.has(session.id.toLowerCase()))
  const skippedSessionCount = sessions.length - sessionsToAdd.length
  if (existingSessions.length + sessionsToAdd.length > MAX_SESSIONS) {
    return invalid(['导入后会超过 5 个会话上限'], skippedSessionCount, [{ code: 'capacity-exceeded' }])
  }
  return {
    valid: true,
    errors: [],
    details: [],
    sessionsToAdd,
    skippedSessionCount,
    totalSessionCount: sessions.length,
  }
}

function invalid(errors: string[], skippedSessionCount = 0, details: BackupValidationDetail[] = []): BackupValidation {
  return {
    valid: false,
    errors,
    details,
    sessionsToAdd: [],
    skippedSessionCount,
    totalSessionCount: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidSessionField(value: Record<string, unknown>): string | undefined {
  const unknownField = Object.keys(value).find((key) => !['id', 'name', 'createdAt', 'windows'].includes(key))
  if (unknownField) return unknownField
  if (typeof value.id !== 'string' || !/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(value.id)) return 'id'
  if (typeof value.name !== 'string' || value.name.trim() === '') return 'name'
  if (!isIsoTimestamp(value.createdAt)) return 'createdAt'
  if (!Array.isArray(value.windows)) return 'windows'
  for (const window of value.windows) {
    if (!isRecord(window) || !Array.isArray(window.tabs)) return 'windows'
    for (const tab of window.tabs) {
      if (!isRecord(tab) || typeof tab.url !== 'string' || typeof tab.title !== 'string') return 'windows.tabs'
    }
  }
  return 'windows'
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}
