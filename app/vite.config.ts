import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' keeps asset paths relative so the built app works whether it is
// served from a domain root, a sub-path (e.g. GitHub Pages), or previewed locally.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg', 'favicon-32.png'],
      manifest: {
        name: '30 Days English · 30 天英语听说强化',
        short_name: '30天英语',
        description: '30 天英语听说强化：科学间隔重复 + 影子跟读 + 精听听写 + 点词查义，离线可用。为有基础、想系统提升听说的学习者设计。',
        theme_color: '#000000',
        background_color: '#000000',
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Cache Free Dictionary API lookups so click-to-define keeps working offline
        // once a word has been looked up.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.dictionaryapi\.dev\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dictionary-api',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
