import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { engine } from './audio/engine'
import { useStore } from './state/store'

// debug handle for end-to-end tests (scheduler tick counter, store access)
;(window as unknown as Record<string, unknown>).__db = { engine, useStore }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
