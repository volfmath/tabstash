export interface PopupStatus {
  version: string
  sessionCount: number
  message: string
}

export function getPopupStatus(version: string): PopupStatus {
  return {
    version,
    sessionCount: 0,
    message: '尚未保存会话',
  }
}
