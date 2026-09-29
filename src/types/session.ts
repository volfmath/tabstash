export const SCHEMA_VERSION = 1 as const
export const MAX_SESSIONS = 5 as const

export type SaveScope = 'current-window' | 'all-windows'
export type RestoreMode = 'preserve-windows' | 'merge-window'

export interface SavedTab {
  url: string
  title: string
}

export interface SavedWindow {
  tabs: SavedTab[]
}

export interface SavedSession {
  id: string
  name: string
  createdAt: string
  windows: SavedWindow[]
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION
  sessions: SavedSession[]
}
