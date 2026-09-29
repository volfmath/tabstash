import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getHostname } from '../lib/url'
import { searchSessions } from '../lib/search'
import type { CapturedSession } from '../lib/session-capture'
import type { SavedSession, SaveScope } from '../types/session'
import type { BackgroundMessage, BackgroundResponse } from '../background/messages'

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

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function exclusionLabel(reason: string): string {
  switch (reason) {
    case 'unsupported-window':
      return '窗口类型不支持'
    case 'missing-url':
      return '缺少网址'
    default:
      return '网址协议不支持'
  }
}

function SessionItem({ session, onRename, onDelete }: SessionItemProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(session.name)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

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
      setActionError(error instanceof Error ? error.message : '重命名失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSession() {
    if (!window.confirm(`确定删除“${session.name}”吗？`)) return
    setBusy(true)
    setActionError('')
    try {
      await onDelete(session.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败')
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
              aria-label="会话名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !name.trim()}>
              保存
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(session.name); setActionError('') }} disabled={busy}>
              取消
            </button>
          </form>
        ) : (
          <h3>{session.name}</h3>
        )}
        {!editing && (
          <div className="session-actions">
            <button type="button" onClick={() => { setActionError(''); setEditing(true) }} disabled={busy} title="重命名会话">
              重命名
            </button>
            <button type="button" onClick={deleteSession} disabled={busy} title="删除会话">
              删除
            </button>
          </div>
        )}
      </div>
      <p className="session-meta">
        {session.windows.length} 个窗口 · {countTabs(session)} 个标签 · {formatCreatedAt(session.createdAt)}
      </p>
      {actionError && <p className="warning" role="status">{actionError}</p>}
      <details className="session-details">
        <summary>查看标签</summary>
        {session.windows.map((window, windowIndex) => {
          let previousHost = ''
          return (
            <section className="saved-window" key={`${session.id}-${windowIndex}`}>
              <h4>窗口 {windowIndex + 1}</h4>
              {window.tabs.length === 0 ? (
                <p className="muted">空窗口</p>
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
      </details>
    </article>
  )
}

export default function Popup() {
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<SaveScope>('current-window')
  const [pending, setPending] = useState<PendingSave | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listReady, setListReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const refreshRequest = useRef(0)
  const dataRevision = useRef(0)

  const version = chrome.runtime.getManifest().version
  const visibleSessions = useMemo(() => searchSessions(sessions, query), [sessions, query])

  useEffect(() => {
    void refreshSessions()
  }, [])

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
        setError(response.message)
      } else {
        setError('后台返回了无法识别的列表结果')
      }
    } catch {
      if (requestId !== refreshRequest.current || revision !== dataRevision.current) return
      setError('无法连接到后台服务，请重新打开弹窗')
    } finally {
      if (requestId === refreshRequest.current) setLoading(false)
    }
  }

  async function previewSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('请输入会话名称')
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
        setError(response.message)
        if (response.code === 'preview-expired') setPending(null)
      } else {
        setError('后台返回了无法识别的预览结果')
      }
    } catch {
      setError('预览失败，请稍后重试')
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
        setNotice(`已保存“${response.session.name}”`)
      } else if (!response.ok) {
        setError(response.message)
        if (response.code === 'preview-expired') setPending(null)
      } else {
        setError('后台返回了无法识别的保存结果')
      }
    } catch {
      setError('保存失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  async function renameSession(id: string, nextName: string) {
    const response = await sendBackground({ type: 'rename-session', id, name: nextName })
    if (!response.ok) throw new Error(response.message)
    dataRevision.current += 1
    setError('')
    setSessions((current) => current.map((item) => item.id === id ? { ...item, name: nextName.trim() } : item))
    setNotice('会话名称已更新')
  }

  async function deleteSession(id: string) {
    const response = await sendBackground({ type: 'delete-session', id })
    if (!response.ok) throw new Error(response.message)
    dataRevision.current += 1
    setError('')
    setSessions((current) => current.filter((item) => item.id !== id))
    setNotice('会话已删除')
  }

  return (
    <main className="popup-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">本地会话</p>
          <h1>Tabstash</h1>
          <p className="muted">v{version} · {sessions.length}/5</p>
        </div>
        <button className="text-button" type="button" onClick={() => chrome.runtime.openOptionsPage()}>
          设置
        </button>
      </header>

      <section className="save-panel" aria-labelledby="save-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">保存工作现场</p>
            <h2 id="save-heading">新建会话</h2>
          </div>
          <span className="limit-label">最多 5 个</span>
        </div>
        <form className="save-form" onSubmit={previewSave}>
          <label>
            名称
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：研究资料" disabled={!listReady || loading || busy || Boolean(pending)} />
          </label>
          <label>
            保存范围
            <select value={scope} onChange={(event) => setScope(event.target.value as SaveScope)} disabled={!listReady || loading || busy || Boolean(pending)}>
              <option value="current-window">当前窗口</option>
              <option value="all-windows">所有普通窗口</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={!listReady || loading || busy || Boolean(pending) || sessions.length >= 5}>
            {busy ? '读取中…' : '预览并保存'}
          </button>
        </form>
        {sessions.length >= 5 && <p className="warning">已达到 5 个会话上限，请删除旧会话后再保存。</p>}
      </section>

      {pending && (
        <section className="preview-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">保存预览</p>
              <h2>{pending.name}</h2>
            </div>
            <span className="preview-count">{pending.preview.includedTabCount} 个标签</span>
          </div>
          <p className="preview-summary">{pending.preview.windows.length} 个窗口、{pending.preview.includedTabCount} 个可保存标签、{pending.preview.excludedTabs.length} 个排除项。不可恢复的标签不会写入会话。</p>
          {pending.preview.excludedTabs.length > 0 && (
            <ul className="excluded-list">
              {pending.preview.excludedTabs.map((tab, index) => (
                <li key={`${tab.url}-${index}`}>
                  <span>{exclusionLabel(tab.reason)}</span>
                  <strong>{tab.title}</strong>
                  {tab.url && <small>{tab.url}</small>}
                </li>
              ))}
            </ul>
          )}
          <div className="preview-actions">
            <button className="primary-button" type="button" onClick={() => void confirmSave()} disabled={busy}>
              {busy ? '保存中…' : '确认保存'}
            </button>
            <button className="secondary-button" type="button" onClick={() => { setPending(null); setError(''); setNotice('') }} disabled={busy}>
              取消
            </button>
          </div>
        </section>
      )}

      {(error || notice) && <p className={error ? 'feedback feedback--error' : 'feedback'} role="status">{error || notice}</p>}

      <section className="sessions-panel" aria-labelledby="sessions-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">已保存</p>
            <h2 id="sessions-heading">会话列表</h2>
          </div>
          <button className="text-button" type="button" onClick={() => void refreshSessions()} disabled={loading}>刷新</button>
        </div>
        <label className="search-field">
          <span>搜索会话、标题或网址</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" />
        </label>
        {loading ? (
          <p className="empty-state">正在读取会话…</p>
        ) : visibleSessions.length === 0 ? (
          <p className="empty-state">{query.trim() ? '没有匹配的会话' : '尚未保存会话'}</p>
        ) : (
          <div className="session-list">
            {visibleSessions.map((session) => (
              <SessionItem key={session.id} session={session} onRename={renameSession} onDelete={deleteSession} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
