const CACHE_NAME = 'trackmap-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/globe.html',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip Firebase requests — these need network
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis.com') && url.pathname.includes('firebasejs')) {
    return;
  }

  // Skip Nominatim (geocoding) — not critical offline
  if (url.hostname.includes('nominatim')) return;

  // Skip open-meteo (weather) — not critical offline
  if (url.hostname.includes('open-meteo')) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200 && e.request.url.startsWith('http')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // Return offline fallback for navigation
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Background sync — sync offline GPS data when back online
self.addEventListener('sync', e => {
  if (e.tag === 'sync-gps-data') {
    e.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  // Notify all clients to sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({type: 'SYNC_NOW'}));
}

// Listen for messages from app
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
