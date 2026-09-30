import type { CapturedSession, ExcludedTab } from '../lib/session-capture'
import type { RestoreTask, RestoreResult } from '../lib/restore'
import type { BackupDocument, BackupValidation, BackupValidationDetail } from '../lib/backup'
import type { SavedSession, SaveScope } from '../types/session'
import type { RestoreMode } from '../types/session'

export type BackgroundMessage =
  | { type: 'save-session'; name: string; scope: SaveScope; confirm?: boolean; previewToken?: string }
  | { type: 'preview-session'; scope: SaveScope }
  | { type: 'list-sessions' }
  | { type: 'rename-session'; id: string; name: string }
  | { type: 'delete-session'; id: string }
  | { type: 'restore-session'; id: string; mode: RestoreMode; requestId: string }
  | { type: 'get-restore-task'; taskId: string }
  | { type: 'list-restore-tasks' }
  | { type: 'export-backup' }
  | { type: 'preview-import'; document: unknown }
  | { type: 'import-backup'; previewToken: string; document: unknown }

export interface SaveSessionSuccess {
  ok: true
  session: SavedSession
  includedTabCount: number
  excludedTabs: ExcludedTab[]
}

export interface PreviewSessionSuccess {
  ok: true
  preview: CapturedSession
  previewToken: string
}

export interface MessageSuccess {
  ok: true
}

export interface ListSessionsSuccess {
  ok: true
  sessions: SavedSession[]
}

export interface RestoreSessionSuccess {
  ok: true
  task: RestoreTask
}

export interface RestoreTaskSuccess {
  ok: true
  task: RestoreTask
}

export interface RestoreTaskListSuccess {
  ok: true
  tasks: RestoreTask[]
}

export interface ExportBackupSuccess {
  ok: true
  document: BackupDocument
}

export interface ImportPreviewSuccess {
  ok: true
  validation: BackupValidation
  previewToken: string
}

export interface ImportBackupSuccess {
  ok: true
  addedSessionCount: number
  skippedSessionCount: number
}

export interface MessageFailure {
  ok: false
  code:
    | 'invalid-message'
    | 'invalid-name'
    | 'limit-reached'
    | 'no-restorable-tabs'
    | 'confirmation-required'
    | 'preview-expired'
    | 'session-not-found'
    | 'storage-error'
    | 'invalid-storage'
    | 'invalid-restore-mode'
    | 'restore-unavailable'
    | 'restore-busy'
    | 'restore-task-not-found'
    | 'invalid-backup'
    | 'backup-preview-expired'
    | 'unknown-error'
  message: string
  errors?: string[]
  details?: BackupValidationDetail[]
  excludedTabs?: ExcludedTab[]
  preview?: CapturedSession
  previewToken?: string
}

export type BackgroundResponse =
  | SaveSessionSuccess
  | PreviewSessionSuccess
  | MessageSuccess
  | ListSessionsSuccess
  | RestoreSessionSuccess
  | RestoreTaskSuccess
  | RestoreTaskListSuccess
  | ExportBackupSuccess
  | ImportPreviewSuccess
  | ImportBackupSuccess
  | { ok: true; result: RestoreResult }
  | MessageFailure

export function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false

  switch (value.type) {
    case 'save-session':
      return (
        typeof value.name === 'string' &&
        (value.scope === 'current-window' || value.scope === 'all-windows') &&
        (value.confirm === undefined || typeof value.confirm === 'boolean') &&
        (value.previewToken === undefined || typeof value.previewToken === 'string')
      )
    case 'preview-session':
      return value.scope === 'current-window' || value.scope === 'all-windows'
    case 'list-sessions':
      return true
    case 'rename-session':
      return typeof value.id === 'string' && typeof value.name === 'string'
    case 'delete-session':
      return typeof value.id === 'string'
    case 'restore-session':
      return typeof value.id === 'string' && isRestoreMode(value.mode) && typeof value.requestId === 'string' && value.requestId.length > 0
    case 'get-restore-task':
      return typeof value.taskId === 'string'
    case 'list-restore-tasks':
      return true
    case 'export-backup':
      return true
    case 'preview-import':
      return 'document' in value
    case 'import-backup':
      return typeof value.previewToken === 'string' && 'document' in value
    default:
      return false
  }
}

function isRestoreMode(value: unknown): value is RestoreMode {
  return value === 'preserve-windows' || value === 'merge-window'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
