import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getHostname } from '../lib/url'
import { searchSessions } from '../lib/search'
import type { CapturedSession } from '../lib/session-capture'
import type { RestoreTask } from '../lib/restore'
import type { RestoreMode, SavedSession, SaveScope } from '../types/session'
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
  onRestore: (session: SavedSession) => void
  restoreBusy: boolean
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

function SessionItem({ session, onRename, onDelete, onRestore, restoreBusy }: SessionItemProps) {
  const [editing, setEditing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
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
            <button type="button" onClick={() => onRestore(session)} disabled={busy || restoreBusy} title="恢复会话">
              恢复
            </button>
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
      <details className="session-details" onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>查看标签</summary>
        {detailsOpen && session.windows.map((window, windowIndex) => {
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
          setError(`暂时无法读取恢复进度：${response.message}`)
          schedulePoll()
        } else {
          setError('暂时无法读取恢复进度：后台返回了无法识别的结果')
          schedulePoll()
        }
      } catch {
        if (!cancelled) {
          setError('暂时无法读取恢复进度，正在重试')
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
        setNotice('恢复任务已开始，原会话保持不变；再次恢复会再次打开标签')
      } else if (!response.ok) {
        setError(response.message)
      } else {
        setError('后台返回了无法识别的恢复结果')
      }
    } catch {
      if (requestId === restoreRequest.current) {
        try {
          const status = await sendBackground({ type: 'get-restore-task', taskId: attempt.requestId })
          if (status.ok && 'task' in status) {
            restoreAttempt.current = null
            setRestoreTask(status.task)
            setRestoreTarget(null)
            setNotice('恢复任务已开始，原会话保持不变')
          } else {
            setError('恢复启动结果未知；请先检查浏览器，重复操作可能再次打开标签')
          }
        } catch {
          setError('恢复启动结果未知；请先检查浏览器，重复操作可能再次打开标签')
        }
      }
    } finally {
      if (requestId === restoreRequest.current) setBusy(false)
    }
  }

  function restoreStatusLabel(status: RestoreTask['status']): string {
    switch (status) {
      case 'running': return '恢复中'
      case 'completed': return '恢复完成'
      case 'completed-with-errors': return '部分完成'
      case 'unconfirmed': return '结果未确认'
    }
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

      {restoreTarget && (
        <section className="restore-panel" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">恢复方式</p>
              <h2>{restoreTarget.name}</h2>
            </div>
            <span className="preview-count">{restoreTarget.windows.length} 个窗口</span>
          </div>
          <label className="restore-mode-field">
            窗口布局
            <select value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as RestoreMode)} disabled={busy}>
              <option value="preserve-windows">保留窗口结构</option>
              <option value="merge-window">合并为一个窗口</option>
            </select>
          </label>
          <div className="preview-actions">
            <button className="primary-button" type="button" onClick={() => void startRestore(restoreTarget.id, restoreMode)} disabled={busy || restoreTask?.status === 'running'}>
              {busy ? '启动中…' : '开始恢复'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setRestoreTarget(null)} disabled={busy}>
              取消
            </button>
          </div>
        </section>
      )}

      {restoreTask && (
        <section className="restore-task" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">恢复任务</p>
              <h2>{restoreStatusLabel(restoreTask.status)}</h2>
            </div>
            <span className="preview-count">{restoreTask.processedTabCount}/{restoreTask.totalTabCount}</span>
          </div>
          <p className="preview-summary">
            新建 {restoreTask.createdWindowCount} 个窗口，打开 {restoreTask.successfulTabCount} 个标签。
            {restoreTask.status === 'unconfirmed'
              ? '后台中断，未自动重试；请检查浏览器后再决定是否恢复。再次恢复会再次打开这些标签。'
              : '再次恢复会再次打开这些标签。'}
          </p>
          {restoreTask.failures.length > 0 && (
            <ul className="restore-failures">
              {restoreTask.failures.map((failure, index) => (
                <li key={`${failure.url}-${index}`}>
                  <strong>{failure.title || failure.url || '未命名标签页'}</strong>
                  <small>{failure.message}{failure.url ? ` · ${failure.url}` : ''}</small>
                </li>
              ))}
            </ul>
          )}
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
              <SessionItem key={session.id} session={session} onRename={renameSession} onDelete={deleteSession} onRestore={chooseRestore} restoreBusy={busy || restoreTask?.status === 'running'} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
