import { useRef, useState, type ChangeEvent } from 'react'
import { Check, Download, FileJson, Upload } from 'lucide-react'
import type { BackupValidation } from '../lib/backup'
import type { BackgroundMessage, BackgroundResponse } from '../background/messages'
import { localizeFailure } from '../i18n/errors'
import { useI18n, useLocalizedMessage } from '../i18n/react'
import { options } from '../i18n/options'

const MAX_BACKUP_FILE_BYTES = 32 * 1024 * 1024

function sendBackground(message: BackgroundMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>
}

interface PendingImport {
  previewToken: string
  validation: BackupValidation
  document: unknown
}

export default function Backup() {
  const { locale } = useI18n()
  const t = options(locale)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useLocalizedMessage()
  const [error, setError] = useLocalizedMessage()

  async function exportBackup() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await sendBackground({ type: 'export-backup' })
      if (!response.ok || !('document' in response)) {
        setError((locale) => response.ok ? options(locale)('unexpectedExport') : localizeFailure(response, locale))
        return
      }
      const blob = new Blob([JSON.stringify(response.document)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tabstash-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice((locale) => options(locale)('backupExported'))
    } catch {
      setError((locale) => options(locale)('exportFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setNotice('')
    setPending(null)
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        setError((locale) => options(locale)('fileTooLarge'))
        return
      }
      let text: string
      try {
        text = await file.text()
      } catch {
        setError((locale) => options(locale)('fileReadFailed'))
        return
      }
      let document: unknown
      try {
        document = JSON.parse(text) as unknown
      } catch {
        setError((locale) => options(locale)('invalidJson'))
        return
      }
      const response = await sendBackground({ type: 'preview-import', document })
      if (!response.ok) {
        setError((locale) => localizeFailure(response, locale))
      } else if ('validation' in response && 'previewToken' in response) {
        setPending({ previewToken: response.previewToken, validation: response.validation, document })
        setNotice((locale) => options(locale)('previewReady'))
      } else {
        setError((locale) => options(locale)('unexpectedImport'))
      }
    } catch {
      setError((locale) => options(locale)('previewFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const response = await sendBackground({ type: 'import-backup', previewToken: pending.previewToken, document: pending.document })
      if (response.ok && 'addedSessionCount' in response) {
        setPending(null)
        setNotice((locale) => options(locale)('backupImported', { added: response.addedSessionCount, skipped: response.skippedSessionCount }))
      } else {
        setError((locale) => response.ok ? options(locale)('unexpectedImportResult') : localizeFailure(response, locale))
        if (!response.ok && response.code === 'backup-preview-expired') setPending(null)
      }
    } catch {
      setPending(null)
      setError((locale) => options(locale)('importUnconfirmed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="options-section backup-section" aria-labelledby="backup-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t('backup')}</p>
          <h1 id="backup-heading">{t('backupTitle')}</h1>
        </div>
        <FileJson size={24} aria-hidden="true" />
      </div>
      <p className="preview-summary">{t('backupPrivacy')}</p>
      <div className="preview-actions">
        <button className="primary-button" type="button" onClick={() => void exportBackup()} disabled={busy}>
          <Download size={16} aria-hidden="true" />{busy ? t('exporting') : t('exportBackup')}
        </button>
        <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Upload size={16} aria-hidden="true" />{busy ? t('importing') : t('chooseImport')}
        </button>
        <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={selectFile} />
      </div>
      {pending && (
        <div className="import-preview" aria-live="polite">
          <strong>{t('importPreview')}</strong>
          <p>{t('importSummary', {
            total: pending.validation.totalSessionCount,
            added: pending.validation.sessionsToAdd.length,
            skipped: pending.validation.skippedSessionCount,
          })}</p>
          <button className="primary-button" type="button" onClick={() => void confirmImport()} disabled={busy}>
            <Check size={16} aria-hidden="true" />{t('confirmImport')}
          </button>
        </div>
      )}
      {(error || notice) && <p className={error ? 'feedback feedback--error' : 'feedback'} role="status">{error || notice}</p>}
    </section>
  )
}
