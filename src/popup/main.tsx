import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from './Popup'
import '../styles.css'

type ExtensionChrome = {
  runtime?: { getURL?: (path: string) => string }
  tabs?: { create?: (details: { url: string }) => void }
}

const extensionChrome = (globalThis as typeof globalThis & { chrome?: ExtensionChrome }).chrome

const openDiffPage = async () => {
  const runtimeUrl = extensionChrome?.runtime?.getURL?.('diff-page.html')

  if (runtimeUrl) {
    extensionChrome?.tabs?.create?.({ url: runtimeUrl })
    return
  }

  window.open('/diff-page.html', '_blank')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup onOpen={openDiffPage} />
  </React.StrictMode>,
)
