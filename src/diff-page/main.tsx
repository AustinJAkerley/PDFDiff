import React from 'react'
import { createRoot } from 'react-dom/client'
import DiffPage from './DiffPage'
import '../styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DiffPage />
  </React.StrictMode>,
)
