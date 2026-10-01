import { isRestorableUrl } from './url'
import type { SavedTab, SavedWindow, SaveScope } from '../types/session'

export interface BrowserTab {
  url?: string
  title?: string
}

export interface BrowserWindow {
  type?: string
  incognito?: boolean
  tabs?: BrowserTab[]
}

export interface WindowsApi {
  getCurrent(options: { populate: boolean }): Promise<BrowserWindow | null>
  getAll(options: { populate: boolean; windowTypes: string[] }): Promise<BrowserWindow[]>
}

export type ExclusionReason = 'unsupported-url' | 'missing-url' | 'unsupported-window'

export interface ExcludedTab {
  url?: string
  title: string
  reason: ExclusionReason
}

export interface CapturedSession {
  windows: SavedWindow[]
  includedTabCount: number
  excludedTabs: ExcludedTab[]
}

function captureWindow(browserWindow: BrowserWindow, excludedTabs: ExcludedTab[]): SavedWindow {
  const tabs: SavedTab[] = []
  for (const tab of browserWindow.tabs ?? []) {
    const title = tab.title?.trim() || tab.url || ''
    if (!tab.url) {
      excludedTabs.push({ title, reason: 'missing-url' })
      continue
    }
    if (!isRestorableUrl(tab.url)) {
      excludedTabs.push({ url: tab.url, title, reason: 'unsupported-url' })
      continue
    }
    tabs.push({ url: tab.url, title })
  }
  return { tabs }
}

function reportExcludedWindow(browserWindow: BrowserWindow, excludedTabs: ExcludedTab[]): void {
  for (const tab of browserWindow.tabs ?? []) {
    const title = tab.title?.trim() || tab.url || ''
    excludedTabs.push({ url: tab.url, title, reason: 'unsupported-window' })
  }
}

export async function captureSession(scope: SaveScope, api: WindowsApi): Promise<CapturedSession> {
  const windows =
    scope === 'current-window'
      ? [await api.getCurrent({ populate: true })]
      : await api.getAll({ populate: true, windowTypes: ['normal'] })

  const excludedTabs: ExcludedTab[] = []
  const savedWindows = windows
    .filter((browserWindow): browserWindow is BrowserWindow => browserWindow !== null)
    .flatMap((browserWindow) => {
      if (browserWindow.type !== undefined && browserWindow.type !== 'normal') {
        reportExcludedWindow(browserWindow, excludedTabs)
        return []
      }
      if (browserWindow.incognito === true) {
        reportExcludedWindow(browserWindow, excludedTabs)
        return []
      }
      return [captureWindow(browserWindow, excludedTabs)]
    })

  return {
    windows: savedWindows,
    includedTabCount: savedWindows.reduce((total, window) => total + window.tabs.length, 0),
    excludedTabs,
  }
}
