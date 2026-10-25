/* Radar Appart : garde une copie de l'appli et des dernières annonces pour l'ouvrir sans réseau.
   Réseau d'abord (les annonces restent à jour), copie locale si le réseau manque ou traîne. */
'use strict';
const CACHE = 'radar-appart-v2';
const SHELL = ['./', 'index.html', 'engine.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'data/listings.json', 'data/meta.json', 'data/criteria.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function cacheKey(req) {
  const u = new URL(req.url);
  u.search = ''; // les paramètres anti-cache de la page ne doivent pas multiplier les copies
  return u.toString();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // photos et polices : le navigateur s'en charge

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = cacheKey(req);
    const net = fetch(req).then(res => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    });
    net.catch(() => {});
    // On attend le réseau 3 secondes au plus, puis on sert la copie si elle existe.
    const timeout = new Promise(resolve => setTimeout(resolve, 3000, null));
    try {
      const fast = await Promise.race([net, timeout]);
      if (fast) return fast;
      const copy = await cache.match(key);
      return copy || await net;
    } catch (err) {
      const copy = await cache.match(key) || (req.mode === 'navigate' ? await cache.match(new URL('index.html', self.location).toString()) : null);
      if (copy) return copy;
      throw err;
    }
  })());
});
