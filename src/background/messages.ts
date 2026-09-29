import type { CapturedSession, ExcludedTab } from '../lib/session-capture'
import type { SavedSession, SaveScope } from '../types/session'

export type BackgroundMessage =
  | { type: 'save-session'; name: string; scope: SaveScope; confirm?: boolean; previewToken?: string }
  | { type: 'preview-session'; scope: SaveScope }
  | { type: 'list-sessions' }
  | { type: 'rename-session'; id: string; name: string }
  | { type: 'delete-session'; id: string }

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
    | 'unknown-error'
  message: string
  excludedTabs?: ExcludedTab[]
  preview?: CapturedSession
  previewToken?: string
}

export type BackgroundResponse =
  | SaveSessionSuccess
  | PreviewSessionSuccess
  | MessageSuccess
  | ListSessionsSuccess
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
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
