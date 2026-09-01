import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

/**
 * Worker cap for the web suite.
 *
 * The default (os.availableParallelism() - 1) spawns 11 jsdom workers on a
 * 12-core machine. Measured on this box:
 *
 *   workers  wall      environment setup (sum across workers)
 *   11       44.4s     105.1s
 *    8       34.2s      49.9s
 *    6       28.6s      37.7s
 *    4       44.5s      51.1s
 *
 * Eleven workers is past the point where each extra jsdom process makes the
 * others slower — memory and CPU contention more than eat the added
 * parallelism. The same contention is what makes time-sensitive tests flake:
 * when `pnpm -r test` runs the other 22 packages at once (or any other work
 * shares the box), the web suite's eleven workers plus everything else leave
 * polling loops without a CPU slice inside their deadline.
 *
 * Capping at 6 leaves the other packages half the machine while keeping the
 * web suite faster than its default, rather than serial — which the brief
 * explicitly ruled out. On a 2-core CI runner this resolves to 1, the same as
 * the old default, so CI behaviour is unchanged.
 */
const maxWorkers = Math.max(1, Math.min(os.availableParallelism() - 1, 6));

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'jsdom',
    maxWorkers,
    setupFiles: ['./src/test/setup.ts'],
    /**
     * The duel suites get the machine to themselves.
     *
     * They play whole multiplayer matches between two full clients and assert
     * LIVENESS — that a table under churn keeps moving inside real deadlines —
     * with the veil's SRA math running in-thread (jsdom has no Worker). Run
     * six-wide with the rest of the suite they stop measuring the room code
     * and start measuring the scheduler: ceremonies overrun their windows and
     * perfectly healthy tables read as wedged.
     *
     * Vitest still schedules projects in parallel, so `package.json`'s test
     * script runs `--project web` then `--project duel`. Serial, after
     * everything else, they measure what they claim to.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/node_modules/**', 'src/app/_multiplayer/duel/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'duel',
          include: ['src/app/_multiplayer/duel/**/*.test.ts'],
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
