import { describe, expect, it } from 'vitest'
import { getHostname, isRestorableUrl } from '../src/lib/url'

describe('isRestorableUrl', () => {
  it('accepts ordinary HTTP and HTTPS URLs', () => {
    expect(isRestorableUrl('http://example.test/path')).toBe(true)
    expect(isRestorableUrl('https://example.test/path?q=1')).toBe(true)
  })

  it('rejects browser-internal, local-file, and malformed URLs', () => {
    expect(isRestorableUrl('chrome://settings')).toBe(false)
    expect(isRestorableUrl('file:///tmp/example.html')).toBe(false)
    expect(isRestorableUrl('not a URL')).toBe(false)
    expect(isRestorableUrl(undefined)).toBe(false)
  })
})

describe('getHostname', () => {
  it('returns a normalized hostname without exposing the full URL', () => {
    expect(getHostname('HTTPS://WWW.Example.Test:443/path')).toBe('www.example.test')
  })

  it('returns a stable fallback for malformed URLs', () => {
    expect(getHostname('not a URL')).toBe('未知主机')
  })
})
