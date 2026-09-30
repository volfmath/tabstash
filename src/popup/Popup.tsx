import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getHostname } from '../lib/url'
import { searchSessions } from '../lib/search'
import type { CapturedSession } from '../lib/session-capture'
import type { RestoreTask } from '../lib/restore'
import type { RestoreMode, SavedSession, SaveScope } from '../types/session'
import type { BackgroundMessage, BackgroundResponse } from '../background/messages'
import { ArrowLeft, ArrowUpRight, Check, Download, FolderOpen, Pencil, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { useI18n, useLocalizedMessage } from '../i18n/react'
import { ui } from '../i18n/ui'
import { localizeFailure, localizeRestoreFailure, LocalizedFailure } from '../i18n/errors'

interface PendingSave {
  name: string
  scope: SaveScope
  preview: CapturedSession
  previewToken: string
}

interface SessionItemProps {
  session: SavedSession
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRestore: (session: SavedSession) => void
  restoreBusy: boolean
  compact: boolean
}

function sendBackground(message: BackgroundMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>
}

function sortSessions(sessions: SavedSession[]): SavedSession[] {
  return [...sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function countTabs(session: SavedSession): number {
  return session.windows.reduce((total, window) => total + window.tabs.length, 0)
}

function formatCreatedAt(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function SessionItem({ session, onRename, onDelete, onRestore, restoreBusy, compact }: SessionItemProps) {
  const { locale } = useI18n()
  const t = ui(locale)
  const [editing, setEditing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [name, setName] = useState(session.name)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useLocalizedMessage()

  useEffect(() => {
    setName(session.name)
    setActionError('')
  }, [session.name])

  async function submitRename(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || name.trim() === session.name) {
      setEditing(false)
      setName(session.name)
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await onRename(session.id, name)
      setEditing(false)
    } catch (error) {
      setActionError((locale) => error instanceof LocalizedFailure ? localizeFailure(error.failure, locale) : ui(locale)('renameFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteSession() {
    if (!window.confirm(t('deleteConfirm', { name: session.name }))) return
    setBusy(true)
    setActionError('')
    try {
      await onDelete(session.id)
    } catch (error) {
      setActionError((locale) => error instanceof LocalizedFailure ? localizeFailure(error.failure, locale) : ui(locale)('deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="session-item">
      <div className="session-item__header">
        {editing ? (
          <form className="rename-form" onSubmit={submitRename}>
            <input
              aria-label={t('sessionName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !name.trim()}>
              {t('save')}
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(session.name); setActionError('') }} disabled={busy}>
              {t('cancel')}
            </button>
          </form>
        ) : (
          <div className="session-title"><FolderOpen size={18} aria-hidden="true" /><h3 title={session.name}>{session.name}</h3></div>
        )}
        {!editing && (
          <div className="session-actions">
            <button className="restore-button" type="button" onClick={() => onRestore(session)} disabled={busy || restoreBusy} title={t('restoreLabel')}>
              <ArrowUpRight size={15} aria-hidden="true" />{t('restore')}
            </button>
            {!compact && <button className="icon-button" type="button" onClick={() => { setActionError(''); setEditing(true) }} disabled={busy} title={t('rename')} aria-label={t('rename')}>
              <Pencil size={16} aria-hidden="true" />
            </button>
            }
            {!compact && <button className="icon-button danger" type="button" onClick={deleteSession} disabled={busy} title={t('delete')} aria-label={t('delete')}>
              <Trash2 size={16} aria-hidden="true" />
            </button>}
          </div>
        )}
      </div>
      <p className="session-meta">
        {t('sessionMeta', { windows: session.windows.length, tabs: countTabs(session) })}<span className="meta-separator"> · </span><time dateTime={session.createdAt}>{formatCreatedAt(session.createdAt, locale)}</time>
      </p>
      {actionError && <p className="warning" role="status">{actionError}</p>}
      {!compact && <details className="session-details" onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>{t('viewTabs')}</summary>
        {detailsOpen && session.windows.map((window, windowIndex) => {
          let previousHost = ''
          return (
            <section className="saved-window" key={`${session.id}-${windowIndex}`}>
              <h4>{t('window', { number: windowIndex + 1 })}</h4>
              {window.tabs.length === 0 ? (
                <p className="muted">{t('emptyWindow')}</p>
              ) : (
                <ul className="saved-tabs">
                  {window.tabs.map((tab, tabIndex) => {
                    const hostname = getHostname(tab.url)
                    const showHost = hostname !== previousHost
                    previousHost = hostname
                    return (
                      <li key={`${tab.url}-${tab.title}-${tabIndex}`}>
                        {showHost && <strong className="host-heading">{hostname}</strong>}
                        <a href={tab.url} target="_blank" rel="noreferrer" title={tab.url}>
                          {tab.title || tab.url}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </details>}
    </article>
  )
}

export default function Popup({ variant = 'popup' }: { variant?: 'popup' | 'manager' }) {
  const { locale } = useI18n()
  const t = ui(locale)
  const compact = variant === 'popup'
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<SaveScope>('current-window')
  const [pending, setPending] = useState<PendingSave | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listReady, setListReady] = useState(false)
  const [error, setError] = useLocalizedMessage()
  const [notice, setNotice] = useLocalizedMessage()
  const [restoreTarget, setRestoreTarget] = useState<SavedSession | null>(null)
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('preserve-windows')
  const [restoreTask, setRestoreTask] = useState<RestoreTask | null>(null)
  const refreshRequest = useRef(0)
  const restoreRequest = useRef(0)
  const restoreAttempt = useRef<{ sessionId: string; mode: RestoreMode; requestId: string } | null>(null)
  const dataRevision = useRef(0)

  const version = chrome.runtime.getManifest().version
  const visibleSessions = useMemo(() => searchSessions(sessions, query), [sessions, query])

  useEffect(() => {
    void refreshSessions()
    void refreshRestoreTasks()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && 'tabstashState' in changes) void refreshSessions()
    }
    chrome.storage?.onChanged?.addListener(onChanged)
    return () => chrome.storage?.onChanged?.removeListener(onChanged)
  }, [])

  useEffect(() => {
    if (!restoreTask || restoreTask.status !== 'running') return
    const taskId = restoreTask.id
    const requestId = restoreRequest.current
    let cancelled = false
    let timer: number | undefined
    const schedulePoll = () => {
      timer = window.setTimeout(() => void poll(), 1_000)
    }
    async function poll() {
      try {
        const response = await sendBackground({ type: 'get-restore-task', taskId })
        if (cancelled || requestId !== restoreRequest.current) return
        if (response.ok && 'task' in response) {
          setRestoreTask(response.task)
          setError('')
          if (response.task.status === 'running') schedulePoll()
        } else if (!response.ok) {
          setError((locale) => localizeFailure(response, locale))
          schedulePoll()
        } else {
          setError((locale) => ui(locale)('pollError'))
          schedulePoll()
        }
      } catch {
        if (!cancelled) {
          setError((locale) => ui(locale)('pollError'))
          schedulePoll()
        }
      }
    }
    schedulePoll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [restoreTask?.id, restoreTask?.status])

  async function refreshSessions() {
    const requestId = ++refreshRequest.current
    const revision = dataRevision.current
    setLoading(true)
    try {
      const response = await sendBackground({ type: 'list-sessions' })
      if (requestId !== refreshRequest.current || revision !== dataRevision.current) return
      if (response.ok && 'sessions' in response) {
        setSessions(sortSessions(response.sessions))
        setError('')
        setListReady(true)
      } else if (!response.ok) {
        setError((locale) => localizeFailure(response, locale))
      } else {
        setError((locale) => ui(locale)('responseError'))
      }
    } catch {
      if (requestId !== refreshRequest.current || revision !== dataRevision.current) return
      setError((locale) => ui(locale)('connectionError'))
    } finally {
      if (requestId === refreshRequest.current) setLoading(false)
    }
  }

  async function previewSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError((locale) => ui(locale)('enterName'))
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await sendBackground({ type: 'preview-session', scope })
      if (response.ok && 'preview' in response) {
        setNotice('')
        setPending({ name: name.trim(), scope, preview: response.preview, previewToken: response.previewToken })
      } else if (!response.ok) {
        setError((locale) => localizeFailure(response, locale))
        if (response.code === 'preview-expired') setPending(null)
      } else {
        setError((locale) => ui(locale)('responseError'))
      }
    } catch {
      setError((locale) => ui(locale)('previewFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmSave() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const response = await sendBackground({
        type: 'save-session',
        name: pending.name,
        scope: pending.scope,
        confirm: true,
        previewToken: pending.previewToken,
      })
      if (response.ok && 'session' in response) {
        dataRevision.current += 1
        setError('')
        setSessions((current) => sortSessions([response.session, ...current.filter((item) => item.id !== response.session.id)]))
        setPending(null)
        setName('')
        setNotice((locale) => ui(locale)('saved', { name: response.session.name }))
      } else if (!response.ok) {
        setError((locale) => localizeFailure(response, locale))
        if (response.code === 'preview-expired') setPending(null)
      } else {
        setError((locale) => ui(locale)('responseError'))
      }
    } catch {
      setError((locale) => ui(locale)('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function renameSession(id: string, nextName: string) {
    const response = await sendBackground({ type: 'rename-session', id, name: nextName })
    if (!response.ok) throw new LocalizedFailure(response)
    dataRevision.current += 1
    setError('')
    setSessions((current) => current.map((item) => item.id === id ? { ...item, name: nextName.trim() } : item))
    setNotice((locale) => ui(locale)('renamed'))
  }

  async function deleteSession(id: string) {
    const response = await sendBackground({ type: 'delete-session', id })
    if (!response.ok) throw new LocalizedFailure(response)
    dataRevision.current += 1
    setError('')
    setSessions((current) => current.filter((item) => item.id !== id))
    setNotice((locale) => ui(locale)('deleted'))
  }

  async function refreshRestoreTasks() {
    const requestId = ++restoreRequest.current
    try {
      const response = await sendBackground({ type: 'list-restore-tasks' })
      if (requestId !== restoreRequest.current) return
      if (response.ok && 'tasks' in response && response.tasks.length > 0) {
        setRestoreTask(response.tasks[0])
      }
    } catch {
      // Restore history is secondary to the session list; keep the popup usable.
    }
  }

  function chooseRestore(session: SavedSession) {
    if (restoreTask?.status === 'running') return
    setError('')
    if (session.windows.length <= 1) {
      void startRestore(session.id, 'preserve-windows')
      return
    }
    setRestoreTarget(session)
    setRestoreMode('preserve-windows')
  }

  async function startRestore(sessionId: string, mode: RestoreMode) {
    if (restoreTask?.status === 'running') return
    const requestId = ++restoreRequest.current
    const attempt = restoreAttempt.current?.sessionId === sessionId && restoreAttempt.current.mode === mode
      ? restoreAttempt.current
      : { sessionId, mode, requestId: crypto.randomUUID() }
    restoreAttempt.current = attempt
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await sendBackground({ type: 'restore-session', id: sessionId, mode, requestId: attempt.requestId })
      if (requestId !== restoreRequest.current) return
      if (response.ok && 'task' in response) {
        restoreAttempt.current = null
        setRestoreTask(response.task)
        setRestoreTarget(null)
        setNotice('')
      } else if (!response.ok) {
        setError((locale) => localizeFailure(response, locale))
      } else {
        setError((locale) => ui(locale)('responseError'))
      }
    } catch {
      if (requestId === restoreRequest.current) {
        try {
          const status = await sendBackground({ type: 'get-restore-task', taskId: attempt.requestId })
          if (status.ok && 'task' in status) {
            restoreAttempt.current = null
            setRestoreTask(status.task)
            setRestoreTarget(null)
            setNotice('')
          } else {
            setError((locale) => ui(locale)('restoreUnknown'))
          }
        } catch {
          setError((locale) => ui(locale)('restoreUnknown'))
        }
      }
    } finally {
      if (requestId === restoreRequest.current) setBusy(false)
    }
  }

  function restoreStatusLabel(status: RestoreTask['status']): string {
    switch (status) {
      case 'running': return t('running')
      case 'completed': return t('completed')
      case 'completed-with-errors': return t('partial')
      case 'unconfirmed': return t('unconfirmed')
    }
  }

  return (
    <div className={compact ? 'popup-shell' : 'sessions-workspace'}>
      <header className="app-header">
        <div className="brand-heading">
          {compact && <img src="/icon48.png" width="30" height="30" alt="" />}
          <h1>{compact ? 'Tabstash' : t('sessions')}</h1>
        </div>
        {compact ? <button className="icon-button" type="button" title={t('manager')} aria-label={t('manager')} onClick={() => void chrome.runtime.openOptionsPage()}>
          <ArrowUpRight size={20} aria-hidden="true" />
        </button> : <span className="limit-label">{t('count', { count: sessions.length })}</span>}
      </header>

      <div className="workspace-body">
      {!pending && !restoreTarget && <section className="save-panel" aria-labelledby="save-heading">
        <div className="section-heading">
          <h2 id="save-heading">{t('saveHeading')}</h2>
        </div>
        <form className="save-form" onSubmit={previewSave}>
          <label>
            <span className="visually-hidden">{t('sessionName')}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('namePlaceholder')} disabled={!listReady || loading || busy} />
          </label>
          <label>
            <span className="visually-hidden">{t('scope')}</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as SaveScope)} disabled={!listReady || loading || busy}>
              <option value="current-window">{t('currentWindow')}</option>
              <option value="all-windows">{t('allWindows')}</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={!listReady || loading || busy || sessions.length >= 5}>
            <Download size={16} aria-hidden="true" />{busy ? t('reading') : t('previewSave')}
          </button>
        </form>
        {sessions.length >= 5 && <p className="warning">{t('limit')}</p>}
      </section>}

      {pending && (
        <section className="preview-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="step-label">{t('preview')}</p>
              <h2>{pending.name}</h2>
            </div>
          </div>
          <p className="preview-summary">{t('previewSummary', { windows: pending.preview.windows.length, tabs: pending.preview.includedTabCount, excluded: pending.preview.excludedTabs.length })}</p>
          {pending.preview.excludedTabs.length > 0 && (
            <details className="excluded-details">
            <summary>{t('excluded', { count: pending.preview.excludedTabs.length })}</summary>
            <ul className="excluded-list">
              {pending.preview.excludedTabs.map((tab, index) => (
                <li key={`${tab.url}-${index}`}>
                  <span>{t(tab.reason === 'unsupported-window' ? 'unsupportedWindow' : tab.reason === 'missing-url' ? 'missingUrl' : 'unsupportedUrl')}</span>
                  <strong>{tab.title}</strong>
                  {tab.url && <small>{tab.url}</small>}
                </li>
              ))}
            </ul>
            </details>
          )}
          <div className="preview-actions">
            <button className="primary-button" type="button" onClick={() => void confirmSave()} disabled={busy}>
              <Check size={16} aria-hidden="true" />{busy ? t('saving') : t('confirmSave')}
            </button>
            <button className="secondary-button" type="button" onClick={() => { setPending(null); setError(''); setNotice('') }} disabled={busy}>
              <ArrowLeft size={16} aria-hidden="true" />{t('back')}
            </button>
          </div>
        </section>
      )}

      {restoreTarget && (
        <section className="restore-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="step-label">{t('restoreHeading')}</p>
              <h2>{restoreTarget.name}</h2>
            </div>
          </div>
          <label className="restore-mode-field">
            {t('restoreMode')}
            <select value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as RestoreMode)} disabled={busy}>
              <option value="preserve-windows">{t('preserve')}</option>
              <option value="merge-window">{t('merge')}</option>
            </select>
          </label>
          <div className="preview-actions">
            <button className="primary-button" type="button" onClick={() => void startRestore(restoreTarget.id, restoreMode)} disabled={busy || restoreTask?.status === 'running'}>
              <ArrowUpRight size={16} aria-hidden="true" />{busy ? t('starting') : t('startRestore')}
            </button>
            <button className="secondary-button" type="button" onClick={() => setRestoreTarget(null)} disabled={busy}>
              <ArrowLeft size={16} aria-hidden="true" />{t('back')}
            </button>
          </div>
        </section>
      )}

      {restoreTask && (
        <section className="restore-task" aria-live="polite">
          <div className="section-heading">
            <div>
              <h2>{restoreStatusLabel(restoreTask.status)}</h2>
            </div>
            <span className="preview-count">{restoreTask.processedTabCount}/{restoreTask.totalTabCount}</span>
            {restoreTask.status !== 'running' && <button className="icon-button" type="button" onClick={() => setRestoreTask(null)} title={t('dismiss')} aria-label={t('dismiss')}><X size={16} aria-hidden="true" /></button>}
          </div>
          <progress max={Math.max(restoreTask.totalTabCount, 1)} value={restoreTask.processedTabCount} aria-label={restoreStatusLabel(restoreTask.status)} />
          <p className="preview-summary">
            {t('progress', { windows: restoreTask.createdWindowCount, tabs: restoreTask.successfulTabCount })}
          </p>
          <p className="muted">{restoreTask.status === 'unconfirmed' ? t('interrupted') : t('repeatWarning')}</p>
          {restoreTask.failures.length > 0 && (
            <details className="excluded-details" open>
            <summary>{t('failures', { count: restoreTask.failures.length })}</summary>
            <ul className="restore-failures">
              {restoreTask.failures.map((failure, index) => (
                <li key={`${failure.url}-${index}`}>
                  <strong>{failure.title || failure.url || t('untitled')}</strong>
                  <small>{localizeRestoreFailure(failure, locale)}{failure.url ? ` · ${failure.url}` : ''}</small>
                </li>
              ))}
            </ul>
            </details>
          )}
        </section>
      )}

      {(error || notice) && <p className={error ? 'feedback feedback--error' : 'feedback'} role="status">{error || notice}</p>}

      {!pending && !restoreTarget && <section className="sessions-panel" aria-labelledby="sessions-heading">
        <div className="section-heading">
          <h2 id="sessions-heading">{t('recent')}</h2>
          <button className="icon-button" type="button" title={t('refresh')} aria-label={t('refresh')} onClick={() => void refreshSessions()} disabled={loading}><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">{t('search')}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} />
        </label>
        {loading ? (
          <p className="empty-state">{t('loading')}</p>
        ) : visibleSessions.length === 0 ? (
          <div className="empty-state"><FolderOpen size={32} aria-hidden="true" /><p>{query.trim() ? t('noMatches') : t('empty')}</p></div>
        ) : (
          <div className="session-list">
            {visibleSessions.map((session) => (
              <SessionItem key={session.id} session={session} onRename={renameSession} onDelete={deleteSession} onRestore={chooseRestore} restoreBusy={busy || restoreTask?.status === 'running'} compact={compact} />
            ))}
          </div>
        )}
      </section>}
      </div>
      {compact && <footer className="popup-footer"><span><ShieldCheck size={13} aria-hidden="true" />{t('local')}</span><span title={`v${version}`}>{t('count', { count: sessions.length })}</span></footer>}
    </div>
  )
}
