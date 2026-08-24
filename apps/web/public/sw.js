/* global importScripts */
importScripts('/precache-manifest.js');

const manifest = self.__PARLOUR_PRECACHE ?? { version: 'shell', urls: [] };
const PRECACHE = `parlour-precache-${manifest.version}`;
const RUNTIME = `parlour-runtime-${manifest.version}`;
const REQUIRED_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];
const PRECACHE_URLS = [...new Set([...REQUIRED_SHELL, ...manifest.urls])];

function cacheable(response) {
  return response.ok && response.type === 'basic';
}

async function cacheResponse(cacheName, request, response) {
  if (!cacheable(response)) return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
}

function navigationCandidates(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') return ['/', '/index.html'];

  const withoutTrailingSlash = pathname.replace(/\/$/, '');
  return [
    pathname,
    `${withoutTrailingSlash}/`,
    `${withoutTrailingSlash}/index.html`,
    `${withoutTrailingSlash}.html`,
  ];
}

async function cachedNavigation(request) {
  const exact = await caches.match(request, { ignoreSearch: true });
  if (exact) return exact;

  const url = new URL(request.url);
  for (const candidate of navigationCandidates(url)) {
    const response = await caches.match(candidate, { ignoreSearch: true });
    if (response) return response;
  }

  return (await caches.match('/offline.html')) ?? Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('parlour-') && key !== PRECACHE && key !== RUNTIME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const network = fetch(request).then((response) => ({
      response,
      cacheWrite: cacheResponse(RUNTIME, request, response),
    }));

    event.respondWith(
      network.then(({ response }) => response).catch(() => cachedNavigation(request)),
    );
    event.waitUntil(network.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
    return;
  }

  const cacheFirst = caches.match(request, { ignoreSearch: true }).then(async (cached) => {
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    const response = await fetch(request);
    return { response, cacheWrite: cacheResponse(RUNTIME, request, response) };
  });

  event.respondWith(cacheFirst.then(({ response }) => response));
  event.waitUntil(cacheFirst.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
});
