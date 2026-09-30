import { useRef, useState, type ChangeEvent } from 'react'
import type { BackupValidation } from '../lib/backup'
import type { BackgroundMessage, BackgroundResponse } from '../background/messages'

const MAX_BACKUP_FILE_BYTES = 32 * 1024 * 1024

function sendBackground(message: BackgroundMessage): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>
}

function openSaveEntry() {
  window.open(chrome.runtime.getURL('src/popup/index.html'), '_blank', 'noopener,noreferrer')
}

interface PendingImport {
  previewToken: string
  validation: BackupValidation
  document: unknown
}

export default function Options() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function exportBackup() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await sendBackground({ type: 'export-backup' })
      if (!response.ok || !('document' in response)) {
        setError(response.ok ? '后台返回了无法识别的导出结果' : response.message)
        return
      }
      const blob = new Blob([JSON.stringify(response.document)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tabstash-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice('备份已下载。JSON 文件包含网址明文，请妥善保存。')
    } catch {
      setError('导出失败，请稍后重试')
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
        setError('备份文件超过 32 MB 文件读取上限')
        return
      }
      const document = JSON.parse(await file.text()) as unknown
      const response = await sendBackground({ type: 'preview-import', document })
      if (!response.ok) {
        setError(response.errors?.join('；') || response.message)
      } else if ('validation' in response && 'previewToken' in response) {
        setPending({ previewToken: response.previewToken, validation: response.validation, document })
        setNotice('文件校验通过，请确认导入。')
      } else {
        setError('后台返回了无法识别的导入预览')
      }
    } catch {
      setError('文件不是有效的 JSON')
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
        setNotice(`导入完成：新增 ${response.addedSessionCount} 个会话，跳过 ${response.skippedSessionCount} 个重复会话。`)
      } else {
        setError(response.ok ? '后台返回了无法识别的导入结果' : response.message)
        if (!response.ok && response.code === 'backup-preview-expired') setPending(null)
      }
    } catch {
      setError('导入失败，请重新选择备份文件')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="options-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Tabstash</p>
          <h1>设置与备份</h1>
          <p className="muted">免费版本地会话工具</p>
        </div>
        <button className="secondary-button" type="button" onClick={openSaveEntry}>
          打开保存入口
        </button>
      </header>

      <section className="options-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">离线副本</p>
            <h2>JSON 备份</h2>
          </div>
        </div>
        <p className="preview-summary">备份包含会话名称、窗口结构、标签标题和网址，不包含 Cookie、网页内容或登录状态。</p>
        <div className="preview-actions">
          <button className="primary-button" type="button" onClick={() => void exportBackup()} disabled={busy}>
            导出备份
          </button>
          <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
            选择 JSON 导入
          </button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={selectFile} />
        </div>
        {pending && (
          <div className="import-preview" aria-live="polite">
            <strong>导入预览</strong>
            <p>{pending.validation.totalSessionCount} 个会话，其中新增 {pending.validation.sessionsToAdd.length} 个，跳过 {pending.validation.skippedSessionCount} 个。</p>
            <button className="primary-button" type="button" onClick={() => void confirmImport()} disabled={busy}>
              确认导入
            </button>
          </div>
        )}
      </section>

      <section className="options-section">
        <p className="eyebrow">隐私边界</p>
        <h2>数据留在本机</h2>
        <p className="preview-summary">Tabstash 只使用浏览器本地存储，不上传会话，不使用账号、云同步、主机权限或内容脚本。导出的 JSON 可能包含敏感网址和查询参数。</p>
        <p className="preview-summary">如果快捷键无法直接打开弹窗，请从扩展图标打开保存入口，或使用本页上方按钮进入保存页面。</p>
      </section>

      {(error || notice) && <p className={error ? 'feedback feedback--error' : 'feedback'} role="status">{error || notice}</p>}
    </main>
  )
}
