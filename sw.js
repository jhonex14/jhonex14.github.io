const CACHE_NAME = 'consultime-v19';
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
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});

// ── Background Notification Handler ──────────────────────────────────────────
// When app.js calls postMessage({ type: 'SHOW_NOTIFICATION', ... }),
// the Service Worker shows it as a real OS notification even if app is minimized.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, tag, url } = event.data;

    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: icon || './consultime_mobile_mockup.png',
        badge: badge || './consultime_mobile_mockup.png',
        tag: tag || 'consultime-alert',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { url: url || '/' }
      })
    );
  }
});

// ── Notification Click Handler ────────────────────────────────────────────────
// When user taps the notification from the top of the screen, open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
