/*
 * Offline support. The booking state already lives in localStorage, so this app works with no
 * network once it has loaded — the only thing standing between it and being usable on the train
 * was fetching the shell. Registered from main.tsx against import.meta.env.BASE_URL, because the
 * scope has to follow the deploy: '/' on Vercel and '/pulse-studio/' on GitHub Pages.
 *
 * Hand-written rather than generated. A plugin would add a build step and a dependency to cache
 * three files, and a service worker is the one piece of a site that can break it permanently for
 * a returning visitor, so it is worth being able to read the whole thing.
 */

const VERSION = 'v1'
const CACHE = `pulse-studio-${VERSION}`

// The hashed asset filenames are only known at build time, and this file is static, so the
// precache is just the document and the icon. Assets are picked up at runtime instead, which is
// safe precisely because their names carry a content hash: a cached one can never be stale.
const SHELL = ['.', 'icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // An install must not fail on one bad response, or the worker never activates and the
      // page silently loses offline support for good.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Cross-origin requests — the Google Fonts stylesheet and its font files — are left to the
  // browser and its own HTTP cache. Caching another origin here would mean guessing at its
  // expiry rules on its behalf.
  if (url.origin !== self.location.origin) return

  // A navigation goes to the network first, so a new deploy is picked up on the next visit
  // rather than being shadowed by a cached document for as long as the cache survives. The
  // cached copy is the offline fallback, not the default answer.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('.', copy))
          return response
        })
        .catch(() => caches.match('.').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // Everything else is a hashed asset: cache first, since the name changes whenever the bytes do.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
