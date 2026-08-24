/**
 * Static server for apps/web/out that mimics how the export is actually served.
 *
 * Two modes, because the podium bug hinges on which one production is:
 *   default            — serve /foo/ and /foo alike, no redirects
 *   --redirect=slash   — 308 /foo  -> /foo/   (Next trailingSlash:true style)
 *   --redirect=clean   — 308 /foo/ -> /foo    (Vercel static default style)
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'apps/web/out');
const PORT = Number(process.env.PORT ?? 4321);
const redirectMode =
  process.argv.find((arg) => arg.startsWith('--redirect='))?.split('=')[1] ?? 'none';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

async function fileAt(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? path : null;
  } catch {
    return null;
  }
}

/** Resolve a URL pathname to a file on disk, Vercel-static style. */
async function resolveFile(pathname) {
  const clean = pathname.replace(/\/+$/, '');
  const candidates = [
    join(ROOT, pathname),
    join(ROOT, clean),
    join(ROOT, clean, 'index.html'),
    join(ROOT, `${clean}.html`),
  ];
  for (const candidate of candidates) {
    const found = await fileAt(candidate);
    if (found) return found;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // Only whole-document navigations get the host's trailing-slash treatment;
  // asset and RSC payload fetches are served as-is, exactly like a CDN.
  const isDocument = !extname(pathname);
  if (isDocument && pathname !== '/') {
    if (redirectMode === 'slash' && !pathname.endsWith('/')) {
      res.writeHead(308, { Location: `${pathname}/${url.search}` });
      res.end();
      return;
    }
    if (redirectMode === 'clean' && pathname.endsWith('/')) {
      res.writeHead(308, { Location: `${pathname.replace(/\/+$/, '')}${url.search}` });
      res.end();
      return;
    }
  }

  const file = await resolveFile(pathname === '/' ? '/index.html' : pathname);
  if (!file) {
    const notFound = await fileAt(join(ROOT, '404.html'));
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    if (notFound) createReadStream(notFound).pipe(res);
    else res.end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[perf] serving ${ROOT} on http://127.0.0.1:${PORT} (redirect=${redirectMode})`);
});
