import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppStateProvider } from './state'
import { ToastProvider } from './components/ui/toast'
import { warmUpVoices } from './lib/speech'
import './index.css'

warmUpVoices()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
)
