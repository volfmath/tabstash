import { describe, expect, it } from 'vitest'
import { searchSessions } from '../src/lib/search'
import type { SavedSession } from '../src/types/session'

const sessions: SavedSession[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: '前端项目',
    createdAt: '2026-09-30T00:00:00.000Z',
    windows: [{ tabs: [{ title: 'React 文档', url: 'https://react.dev/learn' }] }],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: '研究资料',
    createdAt: '2026-09-29T00:00:00.000Z',
    windows: [{ tabs: [{ title: '浏览器扩展设计', url: 'https://example.test/research' }] }],
  },
]

describe('searchSessions', () => {
  it('searches session names, titles, and URLs while preserving session objects', () => {
    expect(searchSessions(sessions, '前端').map((session) => session.id)).toEqual([
      sessions[0].id,
    ])
    expect(searchSessions(sessions, 'React').map((session) => session.id)).toEqual([
      sessions[0].id,
    ])
    expect(searchSessions(sessions, 'research').map((session) => session.id)).toEqual([
      sessions[1].id,
    ])
  })

  it('returns all sessions for an empty query and no results for an unknown query', () => {
    expect(searchSessions(sessions, ' ')).toEqual(sessions)
    expect(searchSessions(sessions, '不存在')).toEqual([])
  })

  it('keeps matching results in creation order instead of Fuse relevance order', () => {
    const matching = [sessions[1], sessions[0]]
    expect(searchSessions(matching, '项目').map((session) => session.id)).toEqual([
      sessions[0].id,
    ])
    expect(searchSessions([sessions[1], sessions[0]], '资料').map((session) => session.id)).toEqual([
      sessions[1].id,
    ])
  })
})
