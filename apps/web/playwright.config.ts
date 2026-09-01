import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level coverage for the things jsdom cannot see.
 *
 * The unit suite is comprehensive about rules, views and stores, and blind to
 * everything that only exists in a real browser: whether the static export
 * actually boots, whether the service worker registers, whether a language
 * change survives a reload, whether a table deals and accepts a click. Those
 * are exactly the failures a player meets first, so they are the ones worth a
 * real browser.
 *
 * The suite runs against the built static export rather than `next dev`,
 * because the export is what ships — to Vercel, into the Tauri shell, and into
 * the service worker's cache.
 */
/** Set by the multiplayer workflow; unset in the default browser gate. */
const multiplayerLane =
  process.env.PARLOUR_MULTIPLAYER_E2E === '1' || process.env.PARLOUR_MULTIPLAYER_E2E === 'true';

export default defineConfig({
  testDir: './e2e',
  // Two suites are excluded from the default run for opposite reasons.
  //
  // Frame-budget runs are slow, assert almost nothing, and produce a table to
  // read rather than a verdict.
  //
  // The multi-context suite is opted in by .github/workflows/multiplayer.yml
  // via PARLOUR_MULTIPLAYER_E2E, the same way the engine's balance gates opt
  // in through PARLOUR_FULL_SIM. It stays out of the default browser gate so
  // a WebRTC flake does not hide a deal or PWA failure.
  testIgnore: multiplayerLane ? ['**/perf/**'] : ['**/perf/**', '**/multiplayer.spec.ts'],
  outputDir: '../../output/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Multiplayer opens several WebRTC contexts per test. Two workers on a
  // shared CI CPU starve heartbeats and the deal, which is how D1i/D1j
  // flickered even when the room logic was fine.
  workers: process.env.CI ? (multiplayerLane ? 1 : 2) : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    // The table is animation-heavy; a trace of a failing deal is worth more
    // than a screenshot of the frame it happened to fail on.
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The PWA install path and the safe-area chrome are iOS-specific, and
    // WebKit is the only engine that can tell us they still work.
    { name: 'webkit', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'node scripts/serve-export.mjs out 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
