import { describe, expect, it } from 'vitest'
import { createBackupDocument, validateBackup } from '../src/lib/backup'
import type { SavedSession } from '../src/types/session'

function session(id: string, url = 'https://example.test/page'): SavedSession {
  return {
    id,
    name: `会话 ${id}`,
    createdAt: '2026-09-30T00:00:00.000Z',
    windows: [{ tabs: [{ url, title: '页面' }] }],
  }
}

describe('backup', () => {
  it('creates a versioned export document with sessions intact', () => {
    const document = createBackupDocument([session('123e4567-e89b-42d3-a456-426614174000')], () => 0)

    expect(document).toEqual({
      schemaVersion: 1,
      exportedAt: '1970-01-01T00:00:00.000Z',
      sessions: [session('123e4567-e89b-42d3-a456-426614174000')],
    })
  })

  it('rejects malformed, future-version, and non-http backup documents', () => {
    expect(validateBackup('{')).toMatchObject({ valid: false })
    expect(validateBackup({ schemaVersion: 99, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [] })).toMatchObject({ valid: false })
    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [session('123e4567-e89b-42d3-a456-426614174000', 'chrome://settings')] })).toMatchObject({ valid: false })
  })

  it('rejects duplicate IDs inside a backup and skips IDs already stored', () => {
    const first = session('123e4567-e89b-42d3-a456-426614174000')
    const second = session('223e4567-e89b-42d3-a456-426614174000')

    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [first, first] })).toMatchObject({
      valid: false,
      errors: ['备份文件包含重复会话 ID: 123e4567-e89b-42d3-a456-426614174000'],
    })
    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [first, second] }, [first])).toMatchObject({
      valid: true,
      sessionsToAdd: [second],
      skippedSessionCount: 1,
    })
  })

  it('treats UUID casing as equivalent when checking duplicates', () => {
    const lower = session('123e4567-e89b-42d3-a456-426614174000')
    const upper = session('123E4567-E89B-42D3-A456-426614174000')

    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [lower, upper] })).toMatchObject({
      valid: false,
      errors: ['备份文件包含重复会话 ID: 123E4567-E89B-42D3-A456-426614174000'],
    })
    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [upper] }, [lower])).toMatchObject({
      valid: true,
      sessionsToAdd: [],
      skippedSessionCount: 1,
    })
  })

  it('rejects unknown fields instead of persisting unvalidated backup data', () => {
    const value = { ...session('123e4567-e89b-42d3-a456-426614174000'), extra: 'unexpected' }

    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [value] })).toMatchObject({
      valid: false,
      errors: ['第 1 个会话包含无效字段、时间或网址'],
    })
  })

  it('rejects the whole import when new sessions exceed the five-session limit', () => {
    const existing = [session('123e4567-e89b-42d3-a456-426614174000'), session('223e4567-e89b-42d3-a456-426614174000'), session('323e4567-e89b-42d3-a456-426614174000'), session('423e4567-e89b-42d3-a456-426614174000')]
    const incoming = [session('523e4567-e89b-42d3-a456-426614174000'), session('623e4567-e89b-42d3-a456-426614174000')]

    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: incoming }, existing)).toMatchObject({
      valid: false,
      errors: ['导入后会超过 5 个会话上限'],
    })
  })

  it('rejects a backup with more than five entries before validating each tab', () => {
    const sessions = Array.from({ length: 6 }, (_, index) => session(`123e4567-e89b-42d3-a456-42661417400${index}`))
    expect(validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions })).toMatchObject({
      valid: false,
      errors: ['备份文件包含超过 5 个会话'],
    })
  })
})
