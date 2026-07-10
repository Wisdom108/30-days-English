/// <reference types="vite-plugin-pwa/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AppStateProvider } from './state'
import { AuthProvider } from './auth'
import { ToastProvider } from './components/ui/toast'
import { warmUpVoices } from './lib/speech'
import './index.css'

// Build stamp — check the console to confirm you're on the latest deploy (rules
// out a stale PWA cache when a fix "didn't land").
export const BUILD = 'v3.2.0'
console.log(`%c30 Days English %c${BUILD}`, 'font-weight:bold', 'color:#0a7cff')

// PWA updates are now PROMPT-based (registerType: 'prompt'): the new SW sits
// waiting until the user opts in, so the app never reloads under their feet.
// App.tsx listens for this event and surfaces a "有新版本 · 点击更新" toast;
// accepting calls updateSW(true) → SKIP_WAITING → controlled reload.
const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(
      new CustomEvent('sw-need-refresh', { detail: { update: () => updateSW(true) } }),
    )
  },
})

warmUpVoices()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
