import React from 'react'
import { createRoot } from 'react-dom/client'
import Popup from './Popup'
import '../styles.css'

type ExtensionApi = {
  runtime?: { getURL?: (path: string) => string }
  tabs?: { create?: (details: { url: string }) => void }
}

type ExtensionGlobal = typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi }

// Firefox exposes `browser`; Chrome and Edge expose `chrome`. Prefer the
// standardized `browser` namespace and fall back to `chrome`.
const extensionApi = (globalThis as ExtensionGlobal).browser ?? (globalThis as ExtensionGlobal).chrome

const openDiffPage = async () => {
  const runtimeUrl = extensionApi?.runtime?.getURL?.('diff-page.html')

  if (runtimeUrl) {
    extensionApi?.tabs?.create?.({ url: runtimeUrl })
    return
  }

  window.open('/diff-page.html', '_blank')
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup onOpen={openDiffPage} />
  </React.StrictMode>,
)
