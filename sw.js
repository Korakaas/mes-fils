// Service worker : garde l'appli disponible même sans réseau. Change VERSION à chaque mise à jour des fichiers.
const VERSION = 'v7';
const CACHE = `mes-fils-${VERSION}`;
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ctx.js', 'js/logic.js', 'js/patternParse.js', 'js/store.js', 'js/sync.js', 'js/media.js', 'js/demo.js',
  'js/views/stock.js', 'js/views/yarn.js', 'js/views/patterns.js', 'js/views/projects.js', 'js/views/settings.js',
  'fonts/nunito-latin-wght-normal.woff2', 'fonts/nunito-latin-ext-wght-normal.woff2',
  'fonts/fraunces-latin-wght-normal.woff2', 'fonts/fraunces-latin-ext-wght-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mes-fils-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase : toujours en direct
  // Réseau d'abord : l'appli se met à jour dès qu'on l'ouvre avec du réseau ; le cache ne sert qu'en secours
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(req);
        return cached || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
      }
    }),
  );
});
