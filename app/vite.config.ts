import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' keeps asset paths relative so the built app works whether it is
// served from a domain root, a sub-path (e.g. GitHub Pages), or previewed locally.
// Dev: proxy the API routes to the deployed Cloudflare Worker so `npm run dev`
// has working AI + neural voice (the Vite server has no backend of its own).
// Same-origin from the browser's view → no CORS, passcode header flows through.
const WORKER = 'https://thirty-days-en.thinkuniverse.workers.dev'
type Fwd = { target: string; changeOrigin: boolean; secure: boolean; ws?: boolean }
const proxy: Record<string, Fwd> = Object.fromEntries(
  ['/health', '/me', '/login', '/logout', '/auth', '/progress', '/ai', '/speech', '/realtime', '/grok', '/wallet', '/earn', '/push', '/memories', '/zaizai'].map((p) => [
    p,
    { target: WORKER, changeOrigin: true, secure: true } as Fwd,
  ]),
)
// The Cloudflare Agents voice tutor is a WebSocket under /agents/* — proxy it
// (with ws) to the deployed Worker so `npm run dev` can reach the voice agent.
proxy['/agents'] = { target: WORKER, changeOrigin: true, secure: true, ws: true }

export default defineConfig({
  base: './',
  server: { host: true, proxy },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // v3.1: custom SW (src/sw.ts) via injectManifest — Web Push needs push/
      // notificationclick handlers, which generateSW can't express. The instant
      // -update semantics (skipWaiting/clientsClaim/cleanupOutdatedCaches) and
      // the dictionary runtime cache moved verbatim into sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'favicon-32.png'],
      manifest: {
        name: '语自在 · 30 Days English 英语听说',
        short_name: '语自在',
        description: '30 天英语听说强化：科学间隔重复 + 影子跟读 + 精听听写 + 点词查义，离线可用。为有基础、想系统提升听说的学习者设计。',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
})