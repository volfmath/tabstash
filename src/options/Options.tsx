import { useEffect, useState } from 'react'
import { Archive, ExternalLink, Languages, LayoutList, Settings as SettingsIcon } from 'lucide-react'
import Popup from '../popup/Popup'
import Backup from './Backup'
import { useI18n } from '../i18n/react'
import { options } from '../i18n/options'
import { SUPPORT_COMMITS_URL, SUPPORT_ISSUES_URL } from '../lib/support'

type View = 'sessions' | 'backup' | 'settings'

function readView(): View {
  const value = window.location.hash.slice(1)
  return value === 'backup' || value === 'settings' || value === 'sessions' ? value : 'sessions'
}

function openSaveEntry() {
  window.open(chrome.runtime.getURL('src/popup/index.html'), '_blank', 'noopener,noreferrer')
}

function SettingsView() {
  const { locale, preference, setPreference, preferenceError } = useI18n()
  const t = options(locale)
  const [saving, setSaving] = useState(false)

  async function changeLanguage(value: 'system' | 'en' | 'zh-CN') {
    setSaving(true)
    try {
      await setPreference(value)
    } catch {
      // The provider exposes the failure so the selected preference remains unchanged.
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="options-section settings-section" aria-labelledby="language-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('settings')}</p>
            <h1 id="language-heading">{t('languageTitle')}</h1>
          </div>
          <Languages size={24} aria-hidden="true" />
        </div>
        <label className="settings-field">
          <span>{t('languageTitle')}</span>
          <select value={preference} onChange={(event) => void changeLanguage(event.target.value as 'system' | 'en' | 'zh-CN')} disabled={saving}>
            <option value="system">{t('languageSystem')}</option>
            <option value="en">{t('languageEnglish')}</option>
            <option value="zh-CN">{t('languageChinese')}</option>
          </select>
        </label>
        {preferenceError && <p className="feedback feedback--error" role="alert">{t('languageSaveError')}</p>}
      </section>
      <section className="options-section feedback-section" aria-labelledby="feedback-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('settings')}</p>
            <h2 id="feedback-heading">{t('feedbackTitle')}</h2>
          </div>
          <ExternalLink size={20} aria-hidden="true" />
        </div>
        <p className="preview-summary">{t('feedbackText')}</p>
        <div className="preview-actions">
          <a className="secondary-button" href={SUPPORT_ISSUES_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <ExternalLink size={16} aria-hidden="true" />{t('reportProblem')}
          </a>
          <a className="secondary-button" href={SUPPORT_ISSUES_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <ExternalLink size={16} aria-hidden="true" />{t('suggestFeature')}
          </a>
          <a className="text-link" href={SUPPORT_COMMITS_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            {t('viewCommits')}
          </a>
        </div>
      </section>
    </>
  )
}

export default function Options() {
  const { locale } = useI18n()
  const t = options(locale)
  const [view, setView] = useState<View>(() => readView())

  useEffect(() => {
    document.title = options(locale)('managerTitle')
  }, [locale])

  useEffect(() => {
    const onHashChange = () => {
      const next = readView()
      if (window.location.hash !== `#${next}`) window.history.replaceState(null, '', `#${next}`)
      setView(next)
    }
    if (window.location.hash !== `#${view}`) window.history.replaceState(null, '', `#${view}`)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [view])

  const navigation = [
    { id: 'sessions' as const, label: t('sessions'), icon: LayoutList },
    { id: 'backup' as const, label: t('backup'), icon: Archive },
    { id: 'settings' as const, label: t('settings'), icon: SettingsIcon },
  ]

  function navigate(id: View, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    window.history.pushState(null, '', `#${id}`)
    setView(id)
  }

  return (
    <div className="manager-layout">
      <aside className="manager-sidebar">
        <div className="manager-brand">
          <img className="manager-brand__mark" src="/icon48.png" width="30" height="30" alt="" />
          <div><strong>Tabstash</strong><span>{t('brandTagline')}</span></div>
        </div>
        <nav aria-label={t('managerTitle')}>
          {navigation.map(({ id, label, icon: Icon }) => (
            <a key={id} className="manager-nav-link" href={`#${id}`} onClick={(event) => navigate(id, event)} aria-current={view === id ? 'page' : undefined} title={label}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="manager-content">
        <header className="app-header manager-header">
          <div>
            <p className="eyebrow">Tabstash</p>
            <h1>{t('managerTitle')}</h1>
          </div>
          <button className="secondary-button" type="button" onClick={openSaveEntry}>
            <ExternalLink size={16} aria-hidden="true" />{t('openSaveEntry')}
          </button>
        </header>
        {view === 'sessions' && <section className="manager-view" aria-label={t('sessions')}><Popup variant="manager" /></section>}
        {view === 'backup' && <section className="manager-view" aria-label={t('backup')}><Backup /></section>}
        {view === 'settings' && <section className="manager-view" aria-label={t('settings')}><SettingsView /></section>}
      </main>
    </div>
  )
}
