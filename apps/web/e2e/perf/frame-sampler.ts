import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * The Playwright side of the frame sampler. The measuring itself lives in
 * `scripts/perf-sampler.js` so that this suite and the ablation sweep share one
 * definition of a slow frame; see that file for what each number means.
 */
export interface FrameStats {
  seconds: number;
  frames: {
    count: number;
    fps: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    /** Frames that missed a 60Hz beat by more than one frame. */
    over33: number;
    /** Frames a player reads as a stutter rather than a slow frame. */
    over50: number;
  };
  blocking: {
    /** Total milliseconds the main thread was unavailable to a queued task. */
    totalMs: number;
    /** Share of the run the main thread spent unavailable. */
    ratio: number;
    p95: number;
    max: number;
  };
  longTasks: { count: number; totalMs: number; max: number };
  /** Bursts the stress rig completed during the sample, when it is driving. */
  bursts: number | null;
}

const SAMPLER = readFileSync(
  fileURLToPath(new URL('../../scripts/perf-sampler.js', import.meta.url)),
  'utf8',
);

/** Installs the sampler and starts it. Call before the work you want measured. */
export async function startSampling(page: Page): Promise<void> {
  await page.evaluate(SAMPLER);
}

export async function stopSampling(page: Page): Promise<FrameStats> {
  return page.evaluate(() => {
    const sampler = (window as unknown as { __perfSampler?: { stop(): FrameStats } }).__perfSampler;
    if (!sampler) throw new Error('sampler was never started');
    return sampler.stop();
  });
}

/** One line per scenario, so a before/after diff is readable in the terminal. */
export function formatStats(label: string, stats: FrameStats): string {
  const { frames, blocking, longTasks } = stats;
  return [
    `${label.padEnd(30)}`,
    `fps ${frames.fps.toFixed(1).padStart(5)}`,
    `p50 ${frames.p50.toFixed(1).padStart(5)}ms`,
    `p95 ${frames.p95.toFixed(1).padStart(6)}ms`,
    `p99 ${frames.p99.toFixed(1).padStart(6)}ms`,
    `>33ms ${String(frames.over33).padStart(4)}`,
    `>50ms ${String(frames.over50).padStart(4)}`,
    `blocked ${blocking.totalMs.toFixed(0).padStart(5)}ms (${(blocking.ratio * 100).toFixed(1)}%)`,
    `longest ${blocking.max.toFixed(0).padStart(4)}ms`,
    longTasks.count > 0 ? `longtasks ${longTasks.count}/${longTasks.totalMs.toFixed(0)}ms` : '',
  ]
    .filter(Boolean)
    .join('  ');
}
