import { describe, expect, it } from 'vitest'
import { getPopupStatus } from '../src/lib/status'

describe('getPopupStatus', () => {
  it('describes an empty popup with the extension version', () => {
    expect(getPopupStatus('0.1.0')).toEqual({
      version: '0.1.0',
      sessionCount: 0,
      message: '尚未保存会话',
    })
  })
})
