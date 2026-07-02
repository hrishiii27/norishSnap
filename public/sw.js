/**
 * NourishSnap AI — Service Worker
 * Handles offline caching with cache-first for static assets
 * and network-first for API calls.
 */

const CACHE_NAME = 'nourishsnap-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/app.js',
  '/js/camera.js',
  '/js/utils/image-compress.js',
  '/js/utils/context-guesser.js',
  '/js/utils/unit-converter.js',
  '/js/agents/vision-parser.js',
  '/js/agents/database-retriever.js',
  '/js/agents/logic-adjuster.js',
  '/js/data/food-dictionary.json',
  '/js/data/container-profiles.json',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Network-first for Gemini API calls
  if (url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline — cannot reach AI service' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache successful responses for same-origin
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
