import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from './Popup'
import '../styles.css'

const openDiffPage = async () => {
  const runtimeUrl = (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome?.runtime?.getURL?.('diff-page.html')

  if (runtimeUrl) {
    const tabsApi = (globalThis as { chrome?: { tabs?: { create?: (details: { url: string }) => void } } }).chrome?.tabs
    tabsApi?.create?.({ url: runtimeUrl })
    return
  }

  window.open('/diff-page.html', '_blank')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup onOpen={openDiffPage} />
  </React.StrictMode>,
)
