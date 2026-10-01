import type { MessageFailure } from '../background/messages'
import type { RestoreFailure } from '../lib/restore'
import type { Locale } from './core'
import type { BackupValidationDetail } from '../lib/backup'

type FailureCode = MessageFailure['code']

export class LocalizedFailure extends Error {
  constructor(readonly failure: MessageFailure) {
    super(failure.message)
  }
}

const failureMessages: Record<FailureCode, Record<Locale, string>> = {
  'invalid-message': { en: 'The request was not recognized.', 'zh-CN': '无法识别的后台消息。' },
  'invalid-name': { en: 'Enter a session name.', 'zh-CN': '请输入会话名称。' },
  'limit-reached': { en: 'All 5 session slots are in use.', 'zh-CN': '5 个会话已存满。' },
  'no-restorable-tabs': { en: 'There are no HTTP(S) tabs to save.', 'zh-CN': '没有可保存的 HTTP(S) 标签页。' },
  'confirmation-required': { en: 'Review the excluded tabs before saving.', 'zh-CN': '请确认排除的标签页后再保存。' },
  'preview-expired': { en: 'The save preview expired. Please preview again.', 'zh-CN': '保存预览已过期，请重新预览。' },
  'session-not-found': { en: 'The saved session was not found.', 'zh-CN': '找不到保存的会话。' },
  'storage-error': { en: 'Unable to access saved sessions.', 'zh-CN': '无法访问本地会话。' },
  'invalid-storage': { en: 'Saved session data is invalid.', 'zh-CN': '本地会话数据无效。' },
  'invalid-restore-mode': { en: 'The restore mode is invalid.', 'zh-CN': '恢复模式无效。' },
  'restore-unavailable': { en: 'Restore is unavailable right now.', 'zh-CN': '恢复服务暂不可用。' },
  'restore-busy': { en: 'Another restore is still running.', 'zh-CN': '已有恢复任务正在运行。' },
  'restore-task-not-found': { en: 'The restore task was not found.', 'zh-CN': '找不到恢复任务。' },
  'invalid-backup': { en: 'The backup could not be imported.', 'zh-CN': '备份无法导入。' },
  'backup-preview-expired': { en: 'The import preview expired or the file changed.', 'zh-CN': '导入预览已过期或文件已变化。' },
  'unknown-error': { en: 'The operation failed. Please try again.', 'zh-CN': '操作失败，请稍后重试。' },
}

const restoreMessages: Record<string, Record<Locale, string>> = {
  'unsupported-url': { en: 'Unsupported URL protocol.', 'zh-CN': '网址协议不支持。' },
  'browser-open-failed': { en: 'The browser could not open this tab.', 'zh-CN': '浏览器无法打开此标签页。' },
  'window-create-failed': { en: 'The browser could not create a window.', 'zh-CN': '浏览器无法创建窗口。' },
  'task-failed': { en: 'The restore task could not be completed.', 'zh-CN': '恢复任务意外中断。' },
}

export function localizeFailure(failure: MessageFailure, locale: Locale): string {
  if (failure.code === 'invalid-backup' && failure.details?.length) {
    return failure.details.map((detail) => localizeBackupDetail(detail, locale)).join(locale === 'zh-CN' ? '；' : '; ')
  }
  return failureMessages[failure.code]?.[locale] ?? failureMessages['unknown-error'][locale]
}

export function localizeRestoreFailure(failure: RestoreFailure, locale: Locale): string {
  const inferredCode = failure.code ?? (failure.message === '网址协议不支持' ? 'unsupported-url' : undefined)
  const message = inferredCode ? restoreMessages[inferredCode]?.[locale] : undefined
  if (message) return message
  if (locale === 'zh-CN') return '标签页恢复失败。'
  return /[\u4e00-\u9fff]/.test(failure.message) ? 'The tab could not be restored.' : failure.message || 'The tab could not be restored.'
}

export function localizeRestoreFailureTitle(failure: RestoreFailure, locale: Locale): string {
  if (failure.code === 'window-create-failed') return locale === 'zh-CN' ? '空窗口' : 'Empty window'
  if (failure.code === 'task-failed') return locale === 'zh-CN' ? '恢复任务' : 'Restore task'
  return failure.title
}

function localizeBackupDetail(detail: BackupValidationDetail, locale: Locale): string {
  const index = detail.index === undefined ? '' : locale === 'zh-CN' ? `第 ${detail.index} 个会话` : `session ${detail.index}`
  const field = detail.field ? ` ${detail.field}` : ''
  switch (detail.code) {
    case 'invalid-field':
      return locale === 'zh-CN' ? `${index}${field} 字段无效` : `${index}${field} field is invalid`
    case 'duplicate-id':
      return locale === 'zh-CN' ? `${index}包含重复会话 ID` : `${index} contains a duplicate session ID`
    case 'unknown-field':
      return locale === 'zh-CN' ? `${index || '备份'}包含未知字段${field}` : `${index || 'Backup'} contains an unknown field${field}`
    case 'unsupported-version':
      return locale === 'zh-CN' ? '备份版本不受支持' : 'The backup version is not supported'
    case 'too-many-sessions':
      return locale === 'zh-CN' ? '备份文件包含超过 5 个会话' : 'The backup contains more than 5 sessions'
    case 'capacity-exceeded':
      return locale === 'zh-CN' ? '导入后会超过 5 个会话上限' : 'Importing this backup would exceed the 5-session limit'
    default:
      return failureMessages['invalid-backup'][locale]
  }
}
