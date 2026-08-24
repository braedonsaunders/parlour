import { defineConfig, devices } from '@playwright/test';

/**
 * Frame-budget runs, kept out of the correctness suite.
 *
 * These tests assert almost nothing and take a minute each: their output is a
 * table of frame times to read, not a pass/fail signal. Mixing them into
 * `test:e2e` would make the suite slow and flaky for no gain, so they live
 * behind `pnpm test:perf` with their own projects.
 *
 * Two engines, because they answer different questions. WebKit is the engine
 * that actually ships to an iPhone, so it is the one whose rendering pipeline —
 * filters, blurs, compositing — behaves like the target. Chromium cannot tell
 * us that, but it *can* be CPU-throttled and can report long tasks, so it is
 * where scripting cost is diagnosed. A change that helps on both is real.
 */
export default defineConfig({
  testDir: './e2e/perf',
  outputDir: '../../output/playwright-perf',
  // Frame timing is a shared-machine measurement; one at a time or it is noise.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'off',
    video: 'off',
  },

  projects: [
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 14'] },
    },
    {
      // Same viewport and pixel ratio, throttled to something phone-shaped.
      // PERF_CPU sets the divisor; 4 is roughly a mid-tier handset next to a
      // developer laptop, and 1 disables it.
      name: 'iphone-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: devices['iPhone 14'].viewport,
        deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
        isMobile: false, // Chromium refuses isMobile without touch emulation quirks
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'node scripts/serve-export.mjs out 4321',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
