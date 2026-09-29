import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { getPopupStatus } from '../lib/status'

function getVersion(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest().version
  }
  return '0.1.0'
}

function Popup() {
  const status = getPopupStatus(getVersion())

  return (
    <main>
      <h1>Tabstash</h1>
      <p className="muted">版本 {status.version}</p>
      <section className="empty-state" aria-live="polite">
        {status.message}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
