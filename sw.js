const CACHE_NAME = 'billbuddy-cache-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  if (request.url.includes('firestore.googleapis.com') ||
      request.url.includes('googleapis.com') ||
      request.url.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        fetchAndCache(request);
        return cachedResponse;
      }
      return fetchAndCache(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

function fetchAndCache(request) {
  return fetch(request).then(response => {
    if (response && response.status === 200 && response.type === 'basic') {
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
    }
    return response;
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { notification: { title: 'BillBuddy', body: event.data.text() } };
  }
  const title = payload.notification?.title || 'BillBuddy';
  const options = {
    body: payload.notification?.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
