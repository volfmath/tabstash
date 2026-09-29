import { handleMessage, type BackgroundDependencies } from './handler'
import { isBackgroundMessage } from './messages'

export interface MessageRuntime {
  onMessage: {
    addListener(listener: MessageListener): void
  }
}

export type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void

export function registerMessageListener(
  runtime: MessageRuntime,
  dependencies: BackgroundDependencies,
): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isPingMessage(message)) {
      sendResponse({ type: 'tabstash:pong', ok: true })
      return
    }
    if (!isBackgroundMessage(message)) {
      sendResponse({ ok: false, code: 'invalid-message', message: '无法识别的后台消息' })
      return
    }
    void handleMessage(message, dependencies).then(sendResponse)
    return true
  })
}

function isPingMessage(value: unknown): value is { type: 'tabstash:ping' } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'tabstash:ping'
  )
}
