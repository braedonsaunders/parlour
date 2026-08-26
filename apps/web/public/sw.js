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

async function matchCurrent(request, runtimeName = RUNTIME) {
  const runtime = await caches.open(runtimeName);
  const cachedRuntime = await runtime.match(request, { ignoreSearch: true });
  if (cachedRuntime) return cachedRuntime;
  const precache = await caches.open(PRECACHE);
  return precache.match(request, { ignoreSearch: true });
}

async function matchNavigation(request) {
  const exact = await matchCurrent(request);
  if (exact) return exact;

  const url = new URL(request.url);
  for (const candidate of navigationCandidates(url)) {
    const response = await matchCurrent(candidate);
    if (response) return response;
  }

  return undefined;
}

async function cachedNavigation(request) {
  return (
    (await matchNavigation(request)) ?? (await matchCurrent('/offline.html')) ?? Response.error()
  );
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

  // Never serve a worker entrypoint.
  //
  // The bundler boots a worker by hanging its chunk list off the script URL's
  // fragment, and the worker reads that back out of `location.href`. Answering
  // the request from here loses the fragment, so the worker starts with no
  // config, aborts with "Missing worker bootstrap config", and closes — every
  // time, for every returning visitor, because a first visit has no service
  // worker yet and a second one does.
  //
  // Both of Parlour's workers died this way in the shipped export: Klondike's
  // winnable search and the Veil shuffle ceremony. Both have in-thread
  // fallbacks, so nothing broke visibly — they simply ran on the main thread,
  // which is the one thing the ceremony must never do. It is a deck of
  // 2048-bit modular exponentiations, and blocking on it starves the heartbeat
  // that decides whether a player is still at the table.
  if (request.destination === 'worker' || request.destination === 'sharedworker') return;

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

  const isMusic = url.pathname.startsWith(MUSIC_PATH_PREFIX);
  const cacheName = isMusic ? MUSIC_RUNTIME : RUNTIME;
  const maxEntries = isMusic ? MUSIC_CACHE_MAX_ENTRIES : undefined;
  const cacheFirst = matchCurrent(request, cacheName).then(async (cached) => {
    if (cached) return { response: cached, cacheWrite: Promise.resolve() };
    const response = await fetch(request);
    return { response, cacheWrite: cacheResponse(cacheName, request, response, maxEntries) };
  });

  event.respondWith(cacheFirst.then(({ response }) => response));
  event.waitUntil(cacheFirst.then(({ cacheWrite }) => cacheWrite).catch(() => undefined));
});
