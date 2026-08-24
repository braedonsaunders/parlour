import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WEB_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const DEFAULT_OUTPUT = join(WEB_ROOT, 'out');
const EXCLUDED_FILES = new Set(['precache-manifest.js', 'sw.js']);
const EXCLUDED_PREFIXES = ['audio/music/'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    if (entry.isFile()) files.push(path);
  }

  return files;
}

function webPath(outputDirectory, path) {
  return `/${relative(outputDirectory, path).split(sep).join('/')}`;
}

export async function generatePrecacheManifest(outputDirectory = DEFAULT_OUTPUT) {
  const output = resolve(outputDirectory);
  const candidates = await walk(output);
  const versionedFiles = candidates
    .filter((path) => {
      const relativePath = relative(output, path).split(sep).join('/');
      return (
        !EXCLUDED_FILES.has(relativePath) &&
        !relativePath.endsWith('.map') &&
        !relativePath.startsWith('.')
      );
    })
    .sort((left, right) => webPath(output, left).localeCompare(webPath(output, right)));
  const files = versionedFiles.filter((path) => {
    const relativePath = relative(output, path).split(sep).join('/');
    return !EXCLUDED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
  });
  const precachedFiles = new Set(files);

  const hash = createHash('sha256');
  let totalBytes = 0;

  for (const path of versionedFiles) {
    const info = await stat(path);
    const url = webPath(output, path);
    if (precachedFiles.has(path)) totalBytes += info.size;
    hash.update(url);
    hash.update(await readFile(path));
  }

  const payload = {
    version: hash.digest('hex').slice(0, 16),
    urls: files.map((path) => webPath(output, path)),
  };
  const source = `self.__PARLOUR_PRECACHE = Object.freeze(${JSON.stringify(payload, null, 2)});\n`;
  await writeFile(join(output, 'precache-manifest.js'), source, 'utf8');

  return { ...payload, totalBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  const result = await generatePrecacheManifest(process.argv[2]);
  const size = (result.totalBytes / (1024 * 1024)).toFixed(1);
  console.log(
    `[parlour] precached ${result.urls.length} app files (${size} MB); music remains on-demand`,
  );
}
