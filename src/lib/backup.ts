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
  sessionsToAdd: SavedSession[]
  skippedSessionCount: number
  totalSessionCount: number
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
  if (!isRecord(input)) return invalid(['备份文件必须是 JSON 对象'])
  if (!hasExactKeys(input, ['schemaVersion', 'exportedAt', 'sessions'])) errors.push('备份文件包含未知字段')
  if (input.schemaVersion !== SCHEMA_VERSION) errors.push('备份版本不受支持')
  if (!isIsoTimestamp(input.exportedAt)) errors.push('备份导出时间无效')
  if (!Array.isArray(input.sessions)) errors.push('备份会话列表无效')
  if (errors.length > 0 || !Array.isArray(input.sessions)) return invalid(errors)
  if (input.sessions.length > MAX_SESSIONS) return invalid(['备份文件包含超过 5 个会话'])

  const sessions: SavedSession[] = []
  const seenIds = new Set<string>()
  for (const [index, value] of input.sessions.entries()) {
    if (!isRecord(value)) {
      errors.push(`第 ${index + 1} 个会话格式无效`)
      continue
    }
    const id = typeof value.id === 'string' ? value.id : ''
    const idKey = id.toLowerCase()
    if (id && seenIds.has(idKey)) {
      errors.push(`备份文件包含重复会话 ID: ${id}`)
      continue
    }
    if (id) seenIds.add(idKey)
    try {
      const validated = validateStoredState({ schemaVersion: SCHEMA_VERSION, sessions: [value] })
      sessions.push(validated.sessions[0])
    } catch {
      errors.push(`第 ${index + 1} 个会话包含无效字段、时间或网址`)
    }
  }
  if (errors.length > 0) return invalid(errors)

  const existingIds = new Set(existingSessions.map((session) => session.id.toLowerCase()))
  const sessionsToAdd = sessions.filter((session) => !existingIds.has(session.id.toLowerCase()))
  const skippedSessionCount = sessions.length - sessionsToAdd.length
  if (existingSessions.length + sessionsToAdd.length > MAX_SESSIONS) {
    return invalid(['导入后会超过 5 个会话上限'], skippedSessionCount)
  }
  return {
    valid: true,
    errors: [],
    sessionsToAdd,
    skippedSessionCount,
    totalSessionCount: sessions.length,
  }
}

function invalid(errors: string[], skippedSessionCount = 0): BackupValidation {
  return {
    valid: false,
    errors,
    sessionsToAdd: [],
    skippedSessionCount,
    totalSessionCount: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
