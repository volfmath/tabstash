import { describe, expect, it } from 'vitest'
import { createTranslator, localizeAutomaticSessionName, resolveLocale, type TranslationCatalog } from '../src/i18n/core'

const catalog = {
  greeting: { en: 'Hello, {name}!', 'zh-CN': '你好，{name}！' },
  count: { en: '{count} tabs', 'zh-CN': '{count} 个标签页' },
} satisfies TranslationCatalog

describe('i18n core', () => {
  it('creates a typed translator and replaces named parameters', () => {
    const translate = createTranslator('zh-CN', catalog)

    expect(translate('greeting', { name: 'Lin' })).toBe('你好，Lin！')
    expect(translate('count', { count: 3 })).toBe('3 个标签页')
  })

  it('resolves supported Chinese system languages and falls back to English', () => {
    expect(resolveLocale('system', 'zh-CN')).toBe('zh-CN')
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-CN')
    expect(resolveLocale('system', 'fr-FR')).toBe('en')
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
  })

  it('translates generated session names without changing user-entered names', () => {
    expect(localizeAutomaticSessionName('会话 1', 'en')).toBe('Session 1')
    expect(localizeAutomaticSessionName('Session 2', 'zh-CN')).toBe('会话 2')
    expect(localizeAutomaticSessionName('项目研究', 'en')).toBe('项目研究')
  })
})
