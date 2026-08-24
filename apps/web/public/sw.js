const CACHE = 'parlour-shell-v3';
const SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        const response = await fetch('/');
        const html = await response.text();
        const assets = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1])
          .filter((path) => path?.startsWith('/'))
          .filter((path, index, all) => all.indexOf(path) === index);
        await cache.addAll(assets);
      })
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const fetchForCache = () =>
    fetch(request).then((response) => {
      const cacheCopy = response.ok && response.type === 'basic' ? response.clone() : null;
      const cacheWrite = cacheCopy
        ? caches.open(CACHE).then((cache) => cache.put(request, cacheCopy))
        : Promise.resolve();

      return { response, cacheWrite };
    });

  if (request.mode === 'navigate') {
    const network = fetchForCache();

    event.respondWith(
      network
        .then(({ response }) => response)
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match('/offline.html'))
            .then((fallback) => fallback ?? Response.error()),
        ),
    );
    event.waitUntil(network.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
    return;
  }

  const cacheFirst = caches
    .match(request)
    .then((cached) =>
      cached ? { response: cached, cacheWrite: Promise.resolve() } : fetchForCache(),
    );

  event.respondWith(cacheFirst.then(({ response }) => response));
  event.waitUntil(cacheFirst.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
});
