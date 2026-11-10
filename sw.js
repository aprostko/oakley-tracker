/* Offline shell. Bump VERSION when you change any file so phones pick up the update. */
const VERSION = 'oakley-v3';
const FILES = ['./', 'index.html', 'css/styles.css', 'manifest.webmanifest', 'js/util.js', 'js/store.js', 'js/sync.js', 'js/stats.js', 'js/charts.js', 'js/export.js', 'js/ui.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // never touch sync traffic
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
