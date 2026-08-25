/* global importScripts */
importScripts('/precache-manifest.js');

const manifest = self.__PARLOUR_PRECACHE ?? { version: 'shell', urls: [] };
const PRECACHE = `parlour-precache-${manifest.version}`;
const RUNTIME = `parlour-runtime-${manifest.version}`;
const MUSIC_RUNTIME = `parlour-music-${manifest.version}`;
const MUSIC_PATH_PREFIX = '/audio/music/';
const MUSIC_CACHE_MAX_ENTRIES = 4;
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

async function cacheResponse(cacheName, request, response, maxEntries) {
  if (!cacheable(response)) return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
  if (maxEntries === undefined) return;

  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)),
  );
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

async function matchNavigation(request) {
  const exact = await caches.match(request, { ignoreSearch: true });
  if (exact) return exact;

  const url = new URL(request.url);
  for (const candidate of navigationCandidates(url)) {
    const response = await caches.match(candidate, { ignoreSearch: true });
    if (response) return response;
  }

  return undefined;
}

async function cachedNavigation(request) {
  return (await matchNavigation(request)) ?? (await caches.match('/offline.html')) ?? Response.error();
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
            .filter(
              (key) =>
                key.startsWith('parlour-') &&
                key !== PRECACHE &&
                key !== RUNTIME &&
                key !== MUSIC_RUNTIME,
            )
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
    event.respondWith(
      (async () => {
        const cached = await matchNavigation(request);
        const network = fetch(request)
          .then((response) => {
            event.waitUntil(cacheResponse(RUNTIME, request, response));
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }

        return (await network) ?? (await cachedNavigation(request));
      })(),
    );
    return;
  }

  const isMusic = url.pathname.startsWith(MUSIC_PATH_PREFIX);
  const cacheName = isMusic ? MUSIC_RUNTIME : RUNTIME;
  const maxEntries = isMusic ? MUSIC_CACHE_MAX_ENTRIES : undefined;
  const cacheFirst = caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    const response = await fetch(request);
    return { response, cacheWrite: cacheResponse(cacheName, request, response, maxEntries) };
  });

  event.respondWith(cacheFirst.then(({ response }) => response));
  event.waitUntil(cacheFirst.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
});
