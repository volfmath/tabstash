import { isRestorableUrl } from './url'
import type { RestoreMode, SavedSession, SavedTab } from '../types/session'

const PROGRESS_TAB_BATCH = 10
const PROGRESS_INTERVAL_MS = 1_000

export interface RestoreFailure {
  url: string
  title: string
  message: string
}

export interface RestoreWindowPlan {
  tabs: SavedTab[]
}

export interface RestorePlan {
  id: string
  sessionId: string
  mode: RestoreMode
  windows: RestoreWindowPlan[]
  invalidTabs: RestoreFailure[]
  totalTabCount: number
}

export type RestoreTaskStatus = 'running' | 'completed' | 'completed-with-errors' | 'unconfirmed'

export interface RestoreTask {
  id: string
  sessionId: string
  mode: RestoreMode
  status: RestoreTaskStatus
  totalTabCount: number
  processedTabCount: number
  successfulTabCount: number
  createdWindowCount: number
  failures: RestoreFailure[]
  startedAt: string
  updatedAt: string
}

export interface RestoreResult {
  taskId: string
  status: Exclude<RestoreTaskStatus, 'running' | 'unconfirmed'>
  createdWindowCount: number
  successfulTabCount: number
  failures: RestoreFailure[]
}

export interface RestoreBrowserApi {
  createWindow(url?: string): Promise<{ id?: number }>
  createTab(input: { windowId: number; url: string }): Promise<unknown>
}

export interface RestoreTaskStore {
  save(task: RestoreTask): Promise<void>
}

export function createRunningRestoreTask(plan: RestorePlan, taskId: string, now = Date.now()): RestoreTask {
  const timestamp = new Date(now).toISOString()
  return {
    id: taskId,
    sessionId: plan.sessionId,
    mode: plan.mode,
    status: 'running',
    totalTabCount: plan.totalTabCount,
    processedTabCount: plan.invalidTabs.length,
    successfulTabCount: 0,
    createdWindowCount: 0,
    failures: [...plan.invalidTabs],
    startedAt: timestamp,
    updatedAt: timestamp,
  }
}

export function createRestorePlan(
  session: SavedSession,
  mode: RestoreMode,
  createPlanId: () => string,
): RestorePlan {
  const invalidTabs: RestoreFailure[] = []
  const sourceWindows = mode === 'merge-window' ? [{ tabs: session.windows.flatMap((window) => window.tabs) }] : session.windows
  const mappedWindows = sourceWindows.map((window) => ({
    tabs: window.tabs.filter((tab) => {
      if (isRestorableUrl(tab.url)) return true
      invalidTabs.push({ url: tab.url, title: tab.title, message: '网址协议不支持' })
      return false
    }),
  }))
  const hasRestorableTabs = mappedWindows.some((window) => window.tabs.length > 0)
  const windows = mappedWindows.filter((window) => hasRestorableTabs || window.tabs.length > 0)

  return {
    id: createPlanId(),
    sessionId: session.id,
    mode,
    windows,
    invalidTabs,
    totalTabCount: windows.reduce((total, window) => total + window.tabs.length, 0) + invalidTabs.length,
  }
}

export async function executeRestorePlan(
  plan: RestorePlan,
  api: RestoreBrowserApi,
  taskStore: RestoreTaskStore,
  createTaskId: () => string,
  now: () => number = Date.now,
  initialTask?: RestoreTask,
): Promise<RestoreResult> {
  const task = initialTask ?? createRunningRestoreTask(plan, createTaskId(), now())
  const taskId = task.id
  const failures = [...task.failures]
  if (!initialTask) await taskStore.save(task)
  let lastPersistedCount = task.processedTabCount
  let lastPersistedAt = now()

  async function checkpointProgress(force = false): Promise<void> {
    const currentTime = now()
    const enoughTabs = task.processedTabCount - lastPersistedCount >= PROGRESS_TAB_BATCH
    const enoughTime = currentTime - lastPersistedAt >= PROGRESS_INTERVAL_MS
    if (!force && !enoughTabs && !enoughTime) return
    await saveProgress(task, taskStore, () => currentTime, failures)
    lastPersistedCount = task.processedTabCount
    lastPersistedAt = currentTime
  }

  for (const window of plan.windows) {
    if (window.tabs.length === 0) {
      try {
        const createdWindow = await api.createWindow()
        if (createdWindow.id === undefined) throw new Error('浏览器没有返回新窗口 ID')
        task.createdWindowCount += 1
      } catch (error) {
        failures.push({ url: '', title: '空窗口', message: toErrorMessage(error) })
      }
      continue
    }

    let targetWindowId: number | undefined
    let firstTabIndex = 0

    while (firstTabIndex < window.tabs.length && targetWindowId === undefined) {
      const tab = window.tabs[firstTabIndex]
      try {
        const createdWindow = await api.createWindow(tab.url)
        if (createdWindow.id === undefined) throw new Error('浏览器没有返回新窗口 ID')
        targetWindowId = createdWindow.id
        task.createdWindowCount += 1
        task.successfulTabCount += 1
      } catch (error) {
        failures.push(toFailure(tab, error))
      } finally {
        firstTabIndex += 1
        task.processedTabCount += 1
        await checkpointProgress()
      }
    }

    if (targetWindowId === undefined) continue

    for (const tab of window.tabs.slice(firstTabIndex)) {
      try {
        await api.createTab({ windowId: targetWindowId, url: tab.url })
        task.successfulTabCount += 1
      } catch (error) {
        failures.push(toFailure(tab, error))
      } finally {
        task.processedTabCount += 1
        await checkpointProgress()
      }
    }
  }

  task.failures = failures
  task.status = failures.length > 0 ? 'completed-with-errors' : 'completed'
  await checkpointProgress(true)
  return {
    taskId,
    status: task.status,
    createdWindowCount: task.createdWindowCount,
    successfulTabCount: task.successfulTabCount,
    failures,
  }
}

async function saveProgress(
  task: RestoreTask,
  taskStore: RestoreTaskStore,
  now: () => number,
  failures: RestoreFailure[],
): Promise<void> {
  task.failures = [...failures]
  task.updatedAt = new Date(now()).toISOString()
  await taskStore.save(task)
}

function toFailure(tab: SavedTab, error: unknown): RestoreFailure {
  return {
    url: tab.url,
    title: tab.title,
    message: toErrorMessage(error, '浏览器无法打开此标签页'),
  }
}

function toErrorMessage(error: unknown, fallback = '浏览器无法创建窗口'): string {
  return error instanceof Error ? error.message : fallback
}
