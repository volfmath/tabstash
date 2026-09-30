import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import Popup from './Popup'
import { I18nProvider, useI18n } from '../i18n/react'

function LocalizedPopup() {
  const { ready } = useI18n()
  return ready ? <Popup /> : null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><LocalizedPopup /></I18nProvider>
  </StrictMode>,
)
