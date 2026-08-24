import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');
const releaseTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!releaseTag) {
  throw new Error('Pass the release tag as an argument or GITHUB_REF_NAME');
}

const [rootPackage, desktopPackage, tauriConfig, cargoManifest] = await Promise.all([
  readFile(resolve(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(resolve(desktopRoot, 'package.json'), 'utf8').then(JSON.parse),
  readFile(resolve(desktopRoot, 'src-tauri/tauri.conf.json'), 'utf8').then(JSON.parse),
  readFile(resolve(desktopRoot, 'src-tauri/Cargo.toml'), 'utf8'),
]);

const cargoPackage = cargoManifest.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
if (!cargoPackage) throw new Error('Could not read the Cargo package version');

const versions = new Map([
  ['root package', rootPackage.version],
  ['desktop package', desktopPackage.version],
  ['Tauri config', tauriConfig.version],
  ['Cargo package', cargoPackage[1]],
]);
const uniqueVersions = new Set(versions.values());

if (uniqueVersions.size !== 1) {
  throw new Error(
    `Desktop versions disagree: ${[...versions].map(([name, version]) => `${name}=${version}`).join(', ')}`,
  );
}

const [version] = uniqueVersions;
if (releaseTag !== `v${version}`) {
  throw new Error(`Release tag ${releaseTag} does not match desktop version v${version}`);
}

console.log(`[parlour] release tag ${releaseTag} matches every desktop version`);
