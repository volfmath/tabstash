import { describe, expect, it } from 'vitest'
import { localizeFailure, localizeRestoreFailure } from '../src/i18n/errors'
import { validateBackup } from '../src/lib/backup'

describe('localized backend failures', () => {
  it.each(['en', 'zh-CN'] as const)('retains unknown backup field names in %s', (locale) => {
    const validation = validateBackup({ schemaVersion: 1, exportedAt: '2026-09-30T00:00:00.000Z', sessions: [], extraField: true })
    const result = localizeFailure({ ok: false, code: 'invalid-backup', message: '', details: validation.details }, locale)
    expect(result).toContain('extraField')
  })

  it('localizes structured backup validation details while retaining field and index', () => {
    const validation = validateBackup({
      schemaVersion: 1,
      exportedAt: '2026-09-30T00:00:00.000Z',
      sessions: [{ id: '123e4567-e89b-42d3-a456-426614174000', name: 'A', createdAt: 'bad', windows: [] }],
    })
    const result = localizeFailure({
      ok: false,
      code: 'invalid-backup',
      message: '未知字段',
      errors: validation.errors,
      details: validation.details,
    }, 'en')

    expect(result).toContain('session 1')
    expect(result).toContain('createdAt')
    expect(result).not.toContain('未知字段')
  })

  it('localizes restore failures from stable codes without using the raw message', () => {
    const failure = {
      url: 'chrome://settings',
      title: '设置',
      code: 'unsupported-url',
      message: '网址协议不支持',
    } as const
    const result = localizeRestoreFailure(failure, 'en')

    expect(result).toContain('Unsupported URL protocol')
    expect(result).not.toContain('网址协议不支持')
    expect(failure.url).toBe('chrome://settings')
  })

  it('does not expose a raw Chinese backend message in English for legacy failures', () => {
    const result = localizeFailure({ ok: false, code: 'storage-error', message: '读取本地会话失败' }, 'en')

    expect(result).toBe('Unable to access saved sessions.')
    expect(result).not.toMatch(/[\u4e00-\u9fff]/)
  })
})
