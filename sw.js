const CACHE_NAME = 'consultime-v1';
const ASSETS = [
  './',
  './login.html',
  './register.html',
  './student-dashboard.html',
  './faculty-dashboard.html',
  './admin-dashboard.html',
  './profile.html',
  './app.js',
  './styles.css'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first fallback to Cache)
self.addEventListener('fetch', (e) => {
  // Let active Realtime Supabase requests pass through untouched
  if (e.request.url.includes('supabase.co')) {
    return;
  }
  
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});
