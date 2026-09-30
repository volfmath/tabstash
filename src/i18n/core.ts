export type Locale = 'en' | 'zh-CN'
export type LanguagePreference = 'system' | Locale

export interface TranslationEntry {
  en: string
  'zh-CN': string
}

export type TranslationCatalog = Record<string, TranslationEntry>
export type TranslationParams = Record<string, string | number>

export function createTranslator<const Catalog extends TranslationCatalog>(
  locale: Locale,
  catalog: Catalog,
): <Key extends keyof Catalog & string>(key: Key, params?: TranslationParams) => string {
  return (key, params) => {
    const template = catalog[key][locale]
    if (!params) return template
    return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (placeholder, name: string) => {
      const value = params[name]
      return value === undefined ? placeholder : String(value)
    })
  }
}

export function resolveLocale(preference: LanguagePreference, systemLanguage: string): Locale {
  if (preference !== 'system') return preference
  return normalizeLocale(systemLanguage)
}

export function normalizeLocale(language: string | undefined): Locale {
  return language?.trim().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'en' || value === 'zh-CN'
}
