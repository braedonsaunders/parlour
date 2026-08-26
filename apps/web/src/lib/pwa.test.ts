import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getInstallPlatform,
  isStandaloneDisplay,
  isTauriRuntime,
  syncAppViewportHeight,
} from './pwa';

describe('installable offline shell', () => {
  it('declares maskable 192px and 512px PNG icons', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
    ) as { icons: { src: string; sizes: string; type: string; purpose?: string }[] };

    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((candidate) => candidate.sizes === size);
      expect(icon).toMatchObject({ type: 'image/png' });
      expect(icon?.purpose).toContain('maskable');
      expect(
        readFileSync(join(process.cwd(), 'public', icon!.src))
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
    }
  });

  it('provides standalone landscape metadata and useful app shortcuts', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
    ) as {
      display: string;
      orientation: string;
      id: string;
      scope: string;
      shortcuts: { url: string }[];
    };

    expect(manifest).toMatchObject({
      display: 'standalone',
      orientation: 'landscape',
      id: '/',
      scope: '/',
    });
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/games/', '/join/']);
  });

  it('precaches a dedicated offline document and serves it for failed navigation', () => {
    const worker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(worker).toContain("'/offline.html'");
    expect(worker).toContain("matchCurrent('/offline.html')");
    expect(worker).toContain('async function matchNavigation(request)');
    expect(readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8')).toContain(
      'You’re still at the table',
    );
  });

  it('ships a framework-free escape hatch for clients trapped on an old app bundle', () => {
    const recovery = readFileSync(join(process.cwd(), 'public/recover.html'), 'utf8');
    expect(recovery).toContain('navigator.serviceWorker.getRegistrations()');
    expect(recovery).toContain("name.startsWith('parlour-')");
    expect(recovery).toContain('location.replace(returnPath())');
    expect(recovery).not.toContain('/_next/');
  });

  it('loads the generated route manifest and activates updates only when requested', () => {
    const worker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

    expect(worker).toContain("importScripts('/precache-manifest.js')");
    expect(worker).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(worker).toContain('`parlour-runtime-${manifest.version}`');
    expect(worker).toContain('`parlour-music-${manifest.version}`');
    expect(worker).toContain("const MUSIC_PATH_PREFIX = '/audio/music/'");
    expect(worker).toContain('const MUSIC_CACHE_MAX_ENTRIES = 4');
    expect(worker).toContain('matchCurrent(request, cacheName)');
    expect(worker).not.toContain(
      "self.addEventListener('install', (event) => {\n  self.skipWaiting",
    );
    expect(worker).toContain('async function matchCurrent(request, runtimeName = RUNTIME)');
    expect(worker).toContain(
      'network.then(({ response }) => response).catch(() => cachedNavigation(request))',
    );
    expect(worker).not.toContain('if (cached) {\n          event.waitUntil(network);');
    expect(worker).toContain('const copy = response.clone()');

    const register = readFileSync(join(process.cwd(), 'src/components/PwaRegister.tsx'), 'utf8');
    expect(register).toContain("register('/sw.js', {");
    expect(register).toContain("updateViaCache: 'none'");
    expect(register).toContain('void nextRegistration.update()');

    const globalError = readFileSync(join(process.cwd(), 'src/app/global-error.tsx'), 'utf8');
    expect(globalError).toContain('recoverPwa()');
    expect(globalError).toContain('Reload clean copy');
  });

  it('precaches routes and lightweight game audio without eagerly caching music', () => {
    const directory = mkdtempSync(join(tmpdir(), 'parlour-precache-'));

    try {
      mkdirSync(join(directory, '_next/static'), { recursive: true });
      mkdirSync(join(directory, 'games'), { recursive: true });
      mkdirSync(join(directory, 'audio/music'), { recursive: true });
      mkdirSync(join(directory, 'audio/sfx'), { recursive: true });
      writeFileSync(join(directory, 'index.html'), '<main>parlour</main>');
      writeFileSync(join(directory, 'games/index.html'), '<main>games</main>');
      writeFileSync(join(directory, '_next/static/app.js'), 'console.log("app")');
      writeFileSync(join(directory, 'audio/music/title.m4a'), 'large soundtrack');
      writeFileSync(join(directory, 'audio/sfx/deal-card.mp3'), 'lightweight game cue');
      writeFileSync(join(directory, 'sw.js'), 'worker source');

      execFileSync(process.execPath, [join(process.cwd(), 'scripts/generate-pwa.mjs'), directory]);
      const generated = readFileSync(join(directory, 'precache-manifest.js'), 'utf8');
      const initialVersion = generated.match(/"version": "([a-f0-9]{16})"/)?.[1];

      expect(generated).toContain('"/index.html"');
      expect(generated).toContain('"/games/index.html"');
      expect(generated).toContain('"/_next/static/app.js"');
      expect(generated).toContain('"/audio/sfx/deal-card.mp3"');
      expect(generated).toMatch(/"version": "[a-f0-9]{16}"/);
      expect(generated).not.toContain('/audio/music/');
      expect(generated).not.toContain('"/sw.js"');

      writeFileSync(join(directory, 'audio/music/title.m4a'), 'replacement soundtrack');
      execFileSync(process.execPath, [join(process.cwd(), 'scripts/generate-pwa.mjs'), directory]);
      const musicUpdate = readFileSync(join(directory, 'precache-manifest.js'), 'utf8');
      expect(musicUpdate).not.toContain('/audio/music/');
      expect(musicUpdate).not.toContain(`"version": "${initialVersion}"`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('sizes the standalone shell to the real window instead of 100dvh', () => {
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const scenes = readFileSync(join(process.cwd(), 'src/styles/scenes.module.css'), 'utf8');

    expect(globals).toContain('--app-height: max(100dvh, var(--app-window-height))');
    expect(globals).toContain('--app-height: max(100lvh, var(--app-window-height))');
    expect(globals).toContain('env(safe-area-inset-top)');
    expect(globals).toMatch(/\.chrome-nw\s*\{[^}]*safe-area-inset-top/s);
    expect(globals).toMatch(/\.chrome-ne\s*\{[^}]*safe-area-inset-top/s);
    expect(globals).toMatch(/\.safe-page\s*\{[^}]*safe-area-inset-top/s);
    // The scene backdrop spans the viewport insets *and* the measured window, so
    // neither reading coming up short can leave a bare strip under the fold.
    expect(scenes).toMatch(/\.stage\s*\{[^}]*inset:\s*0;/s);
    expect(scenes).toMatch(/\.stage\s*\{[^}]*min-height:\s*var\(--app-height\);/s);
    const splash = readFileSync(join(process.cwd(), 'src/styles/splash.module.css'), 'utf8');
    expect(splash).toMatch(/\.overlay\s*\{[^}]*inset:\s*0;/s);
    expect(splash).toMatch(/\.overlay\s*\{[^}]*min-height:\s*var\(--app-height\);/s);
    expect(readFileSync(join(process.cwd(), 'src/app/profile/page.tsx'), 'utf8')).toContain(
      'safe-page',
    );
    const home = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8');
    expect(home).toMatch(/chrome-ne fixed/);
    expect(home).not.toMatch(/chrome-ne absolute/);
  });

  it('removes production service workers and parlour caches during development', () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

    expect(layout).toContain("process.env.NODE_ENV === 'development'");
    expect(layout).toContain('id="parlour-pwa-development-reset"');
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain("key.startsWith('parlour-')");
    expect(layout).toContain("new URL(worker.scriptURL).pathname === '/sw.js'");
  });
});

describe('PWA runtime detection', () => {
  it('recognizes iPad desktop mode and Android browsers', () => {
    const iPad = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    } as Navigator;
    const android = {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    } as Navigator;

    expect(getInstallPlatform(iPad)).toBe('ios');
    expect(getInstallPlatform(android)).toBe('android');
  });

  it('recognizes installed display modes and desktop wrappers', () => {
    const standaloneWindow = {
      matchMedia: () => ({ matches: true }),
      location: { protocol: 'https:', hostname: 'parlour.app' },
    } as unknown as Window;
    const tauriWindow = {
      matchMedia: () => ({ matches: false }),
      location: { protocol: 'https:', hostname: 'tauri.localhost' },
    } as unknown as Window;

    expect(isStandaloneDisplay(standaloneWindow, {} as Navigator)).toBe(true);
    expect(isTauriRuntime(tauriWindow)).toBe(true);
  });

  it('publishes the real window height in standalone and clears it in the browser', () => {
    const styles = new Map<string, string>();
    const standaloneWindow = {
      innerHeight: 390,
      document: {
        documentElement: {
          style: {
            setProperty: (name: string, value: string) => styles.set(name, value),
            removeProperty: (name: string) => styles.delete(name),
          },
        },
      },
      matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrame: () => undefined,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      visualViewport: null,
    } as unknown as Window;

    const stopStandalone = syncAppViewportHeight(standaloneWindow, {} as Navigator);
    expect(styles.get('--app-window-height')).toBe('390px');
    stopStandalone();
    expect(styles.has('--app-window-height')).toBe(false);

    const browserWindow = {
      ...standaloneWindow,
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;
    syncAppViewportHeight(browserWindow, {} as Navigator);
    expect(styles.has('--app-window-height')).toBe(false);
  });

  it('takes the taller of the window and the visual viewport', () => {
    const styles = new Map<string, string>();
    const tallVisualViewport = {
      innerHeight: 700,
      document: {
        documentElement: {
          style: {
            setProperty: (name: string, value: string) => styles.set(name, value),
            removeProperty: (name: string) => styles.delete(name),
          },
        },
      },
      matchMedia: () => ({ matches: true }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
      cancelAnimationFrame: () => undefined,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      visualViewport: { height: 744.5, addEventListener: () => undefined },
    } as unknown as Window;

    syncAppViewportHeight(tallVisualViewport, {} as Navigator);
    expect(styles.get('--app-window-height')).toBe('745px');
  });
});
