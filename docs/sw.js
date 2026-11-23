// service worker Sonora : l'appli s'ouvre même sans réseau ; le réseau reste prioritaire pour recevoir les mises à jour
const C = 'sonora-mwsokv4k';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)).catch(() => {}); return res; }).catch(() => caches.match(r)));
});
