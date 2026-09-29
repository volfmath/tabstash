import Fuse, { type IFuseOptions } from 'fuse.js'
import type { SavedSession } from '../types/session'

const searchOptions: IFuseOptions<SavedSession> = {
  includeScore: true,
  threshold: 0.38,
  ignoreLocation: true,
  keys: ['name', 'windows.tabs.title', 'windows.tabs.url'],
}

export function searchSessions(sessions: SavedSession[], query: string): SavedSession[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return sessions
  return new Fuse(sessions, searchOptions)
    .search(normalizedQuery)
    .map((result) => result.item)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
