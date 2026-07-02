/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL?: string
  readonly VITE_SAME_ORIGIN?: string
  readonly VITE_AZURE_VOICE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
