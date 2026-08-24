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
export default defineConfig({
  testDir: './e2e',
  // Frame-budget runs have their own config: they are slow, they assert almost
  // nothing, and their output is a table to read rather than a verdict.
  testIgnore: '**/perf/**',
  outputDir: '../../output/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
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
