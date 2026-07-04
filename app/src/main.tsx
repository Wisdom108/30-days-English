import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppStateProvider } from './state'
import { AuthProvider } from './auth'
import { ToastProvider } from './components/ui/toast'
import { warmUpVoices } from './lib/speech'
import './index.css'

// Build stamp — check the console to confirm you're on the latest deploy (rules
// out a stale PWA cache when a fix "didn't land").
export const BUILD = 'v2.5.3'
console.log(`%c30 Days English %c${BUILD}`, 'font-weight:bold', 'color:#cb3a24')

warmUpVoices()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <AppStateProvider>
            <App />
          </AppStateProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
)
