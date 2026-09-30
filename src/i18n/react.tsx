import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { isLanguagePreference, resolveLocale, type LanguagePreference, type Locale } from './core'

export const LANGUAGE_PREFERENCE_KEY = 'tabstashLanguagePreference'

export interface I18nContextValue {
  locale: Locale
  preference: LanguagePreference
  setPreference: (preference: LanguagePreference) => Promise<void>
  ready: boolean
  preferenceError: string | null
}

const defaultContext: I18nContextValue = {
  locale: 'zh-CN',
  preference: 'system',
  setPreference: async () => undefined,
  ready: true,
  preferenceError: null,
}

const I18nContext = createContext<I18nContextValue>(defaultContext)

export function I18nProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system')
  const [systemLanguage, setSystemLanguage] = useState(() => detectSystemLanguage())
  const [ready, setReady] = useState(false)
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const locale = resolveLocale(preference, systemLanguage)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    let cancelled = false
    const storage = getChromeStorage()
    void Promise.resolve()
      .then(() => storage.get(LANGUAGE_PREFERENCE_KEY))
      .then((result) => {
        if (cancelled) return
        const stored = result[LANGUAGE_PREFERENCE_KEY]
        if (isLanguagePreference(stored)) setPreferenceState(stored)
        setPreferenceError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setPreferenceError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local' || !(LANGUAGE_PREFERENCE_KEY in changes)) return
      const next = changes[LANGUAGE_PREFERENCE_KEY]?.newValue
      if (isLanguagePreference(next)) {
        setPreferenceState(next)
        setPreferenceError(null)
      } else if (next === undefined) {
        setPreferenceState('system')
        setPreferenceError(null)
      }
    }
    const onLanguageChanged = () => setSystemLanguage(detectSystemLanguage())
    getChromeStorageEvents()?.addListener(onChanged)
    if (typeof window !== 'undefined') window.addEventListener('languagechange', onLanguageChanged)
    return () => {
      cancelled = true
      getChromeStorageEvents()?.removeListener(onChanged)
      if (typeof window !== 'undefined') window.removeEventListener('languagechange', onLanguageChanged)
    }
  }, [])

  const setPreference = useCallback(async (next: LanguagePreference) => {
    try {
      await getChromeStorage().set({ [LANGUAGE_PREFERENCE_KEY]: next })
      setPreferenceState(next)
      setPreferenceError(null)
    } catch (error) {
      const message = errorMessage(error)
      setPreferenceError(message)
      throw error instanceof Error ? error : new Error(message)
    }
  }, [])

  const value = useMemo(() => ({ locale, preference, setPreference, ready, preferenceError }), [
    locale,
    preference,
    setPreference,
    ready,
    preferenceError,
  ])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

type LocalizedMessage = '' | ((locale: Locale) => string)

export function useLocalizedMessage(): [string, (message: LocalizedMessage) => void] {
  const { locale } = useI18n()
  const [message, setMessage] = useState<LocalizedMessage>('')
  // Store the formatter itself; React otherwise treats it as a state updater.
  const updateMessage = useCallback((next: LocalizedMessage) => setMessage(() => next), [])
  return [typeof message === 'function' ? message(locale) : message, updateMessage]
}

function detectSystemLanguage(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) return chrome.i18n.getUILanguage()
  } catch {
    // Fall through to the browser language when the Chrome API is unavailable.
  }
  return typeof navigator !== 'undefined' ? navigator.language : 'en'
}

function getChromeStorage(): Pick<chrome.storage.LocalStorageArea, 'get' | 'set'> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return {
      get: async () => ({}),
      set: async () => undefined,
    }
  }
  return chrome.storage.local
}

function getChromeStorageEvents(): {
  addListener(listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void): void
  removeListener(listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void): void
} | undefined {
  return typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
