/// <reference lib="WebWorker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Custom service worker (injectManifest, §8.2). Keeps the exact semantics the
// old generateSW config had — precache + instant activation + the dictionary
// runtime cache — and adds Web Push. The server sends payload-FREE tickles
// (no RFC 8291 encryption), so on `push` we fetch the personalized morning
// line from /zaizai/push-preview: the session cookie rides along same-origin.

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Apply new versions immediately: without these a deployed fix only activates
// after the user closes EVERY tab (the new SW sits "waiting"), so shipped bug
// fixes look like they never landed.
self.skipWaiting()
clientsClaim()

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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0] as WindowClient | undefined
      return win ? win.focus() : self.clients.openWindow('/')
    }),
  )
})
