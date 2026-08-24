/**
 * A static file server for the built export, with no dependencies.
 *
 * The e2e suite has to run against `out/` rather than `next dev`, because the
 * export is what actually ships — to Vercel, into the Tauri shell, and into the
 * service worker's precache. Serving it needs about forty lines, and a
 * dependency for that is forty lines plus a transitive tree that has already
 * broken an install once.
 *
 * Two behaviours matter for parlour specifically:
 *
 * - `trailingSlash` is on, so `/hearts/table/` must resolve to
 *   `out/hearts/table/index.html`.
 * - The service worker must be served from the root scope with a correct MIME
 *   type, or registration silently fails and the offline test passes for the
 *   wrong reason.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolves a URL path to a file inside `root`, or null if it escapes it. */
function fileFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const candidate = resolve(join(root, normalize(decoded)));
  // Path traversal guard: a request for `/../../etc/passwd` must not leave the
  // export, even in a test-only server.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const indexed = join(candidate, 'index.html');
  if (existsSync(indexed) && statSync(indexed).isFile()) return indexed;
  return null;
}

const server = createServer((request, response) => {
  const file = fileFor(request.url ?? '/');
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    // The service worker must be free to update between tests.
    'cache-control': 'no-store',
    // Registration is scoped to the path the worker is served from; without
    // this the root-scoped worker parlour ships would be refused.
    'service-worker-allowed': '/',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`serving ${root} on http://127.0.0.1:${port}\n`);
});
