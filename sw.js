const CACHE_VERSION = 'v9';
const STATIC_CACHE = `one-aqua-static-${CACHE_VERSION}`;
const API_CACHE    = `one-aqua-api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/shrimp-price',
  '/ai-diagnosis',
  '/farm-calculator',
  '/products',
  '/news',
  '/guides',
  '/about',
  '/contact',
  '/team',
  '/guides/ehp',
  '/guides/wssv',
  '/guides/ems',
  '/guides/vibriosis',
  '/guides/wfs',
  '/guides/water-quality',
  '/guides/pond-prep',
  '/guides/biosecurity',
  '/css/main.css',
  '/js/main.js',
  '/js/i18n.js',
  '/logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

const OFFLINE_URL = '/offline.html';

// ── Install: pre-cache static assets ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: route strategy ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets: cache-first
  if (/\.(css|js|jpg|jpeg|png|svg|woff2|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages: stale-while-revalidate
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: network
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request) || new Response(JSON.stringify({ error: 'offline' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise || caches.match(OFFLINE_URL);
}
