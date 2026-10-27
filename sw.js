// Service Worker: speichert die ganze App beim ersten Besuch, danach läuft sie ohne Netz.
// Der Block zwischen den Marken wird von tools/precache.mjs erzeugt (node tools/precache.mjs).

// >>> precache
const VERSION = 'f0fc8ff917';
const ASSETS = [
  './',
  './assets/css/app.css',
  './assets/css/blatt.css',
  './assets/css/print.css',
  './assets/css/slip.css',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/icon.svg',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/backup.js',
  './src/calc/inverse.js',
  './src/calc/money.js',
  './src/calc/payroll.js',
  './src/calc/rates.js',
  './src/calc/sv.js',
  './src/calc/tax.js',
  './src/editor.js',
  './src/export-pdf.js',
  './src/generators/faelle.js',
  './src/generators/rng.js',
  './src/library.js',
  './src/main.js',
  './src/model.js',
  './src/rueck.js',
  './src/scenarios.js',
  './src/slip.js',
  './src/store.js',
  './src/ui.js',
  './src/worksheet.js',
  './src/zufall-ui.js',
  './vendor/html2canvas/html2canvas.min.js',
  './vendor/jspdf/jspdf.umd.min.js',
];
// <<< precache

const CACHE_PREFIX = 'lohnzettel-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data === 'STATUS' && event.ports[0]) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.keys()).length;
        event.ports[0].postMessage({ version: VERSION, expected: ASSETS.length, cached });
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(request);
      } catch (err) {
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
