import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'

function Options() {
  return (
    <main>
      <h1>设置</h1>
      <p className="muted">Tabstash 本地会话设置</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
)
