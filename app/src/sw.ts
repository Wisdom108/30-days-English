/// <reference lib="WebWorker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Custom service worker (injectManifest, §8.2). Precache + runtime caches +
// Web Push. v3.2: PROMPT update flow — no skipWaiting/clientsClaim on install;
// the page shows an update toast and posts SKIP_WAITING when the user accepts
// (standard vite-plugin-pwa `registerType: 'prompt'` handshake).
// The server sends payload-FREE push tickles (no RFC 8291 encryption), so on
// `push` we fetch the personalized morning line from /zaizai/push-preview:
// the session cookie rides along same-origin.

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Prompt-mode activation: the page calls updateSW(true) → vite-plugin-pwa
// posts { type: 'SKIP_WAITING' } → the waiting SW takes over and the page reloads.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

// Cache Free Dictionary API lookups so click-to-define keeps working offline
// once a word has been looked up.
registerRoute(
  /^https:\/\/api\.dictionaryapi\.dev\/.*/i,
  new CacheFirst({
    cacheName: 'dictionary-api',
    plugins: [
      new ExpirationPlugin({ maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 90 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Hashed build assets that are globIgnored from the precache manifest (the big
// Azure speech SDK chunk + rarely-used font subsets) — cache on first use so
// repeat visits and offline still work without bloating install.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/assets/'),
  new CacheFirst({
    cacheName: 'build-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

self.addEventListener('push', (event) => {
  event.waitUntil(
    fetch('/zaizai/push-preview', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ text?: string }>) : null))
      .catch(() => null)
      .then((d) =>
        self.registration.showNotification('在在', {
          body: d?.text || '今天的计划好了,来看看',
          icon: '/pwa-192.png',
          data: { url: '/' },
        }),
      ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0] as WindowClient | undefined
      if (win) {
        // Focus, then steer the window to the notification's target unless it
        // is already there; ignore navigate failures (detached client etc.).
        const target = new URL(url, self.location.origin).href
        return win.focus().then((w) => (w.url === target ? undefined : w.navigate(url).catch(() => undefined)))
      }
      return self.clients.openWindow(url)
    }),
  )
})
