import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import Options from './Options'
import { I18nProvider, useI18n } from '../i18n/react'

function LocalizedOptions() {
  const { ready } = useI18n()
  return ready ? <Options /> : null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><LocalizedOptions /></I18nProvider>
  </StrictMode>,
)
