'use client';

/**
 * The renderer stress harness.
 *
 * Mounts the real Wild table screen — same components, same CSS, same scene
 * behind it — and feeds it a seeded firehose of engine effects at a rate no bot
 * would ever play at. See `@/lib/table/stress-rig` for why the rules are
 * replaced but the renderer is not.
 *
 * Two modes, because the two questions need different clocks.
 *
 * The default drives bursts on a timer and is what you watch: it looks like a
 * very fast game, and a frame sampler can be pointed at it.
 *
 * `?bench=N` instead runs N bursts back to back, each one flushed
 * synchronously and followed by a forced layout read, timing each. That takes
 * the compositor out of the loop entirely — which matters, because headless
 * frame pacing turned out to be chaotic enough to swamp any change worth
 * making, to the point where switching effects *off* routinely measured slower.
 * A burst timed this way is React's render plus the browser's style and layout
 * for the same work every run, and it varies by a couple of percent instead of
 * thirty.
 *
 * Linked from nowhere, holds no game logic, and drives no engine. Playwright
 * uses it in `e2e/perf/wild-table.perf.spec.ts`.
 */

import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { WildTableScreen } from '@/components/table/wild/WildTableScreen';
import {
  stressConfigFromSearch,
  StressRig,
  STRESS_DEFAULTS,
  type StressStep,
} from '@/lib/table/stress-rig';

export default function TableStressPage() {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const config = useMemo(
    () => (search === '' ? STRESS_DEFAULTS : stressConfigFromSearch(search)),
    [search],
  );
  const benchBursts = useMemo(() => {
    const raw = new URLSearchParams(search).get('bench');
    if (raw === null) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? Math.min(2000, Math.max(1, value)) : 0;
  }, [search]);

  const [rig] = useState(() => new StressRig(config));
  const [step, setStep] = useState<StressStep>(() => rig.opening());
  const [bench, setBench] = useState<BenchResult | null>(null);
  const benchRun = useRef(false);
  // React's own accounting of the render phase, so the burst cost can be split
  // three ways: rendering components, running the effects they schedule, and
  // the browser laying the result out. They are fixed by different things and
  // chasing the wrong third of it wastes a build.
  const renderMs = useRef(0);
  const onRender = useCallback((_id: string, _phase: unknown, actualDuration: number) => {
    renderMs.current += actualDuration;
  }, []);

  useEffect(() => {
    if (benchBursts > 0) return;
    const timer = window.setInterval(() => setStep(rig.next()), config.stepMs);
    return () => window.clearInterval(timer);
  }, [benchBursts, config.stepMs, rig]);

  useEffect(() => {
    if (benchBursts === 0 || benchRun.current) return;
    benchRun.current = true;
    // A frame's grace so fonts and the first paint are not charged to burst one.
    const timer = window.setTimeout(
      () => setBench(runBench(rig, benchBursts, setStep, renderMs)),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [benchBursts, rig]);

  return (
    <>
      <Profiler id="table" onRender={onRender}>
        <WildTableScreen
          view={step.view}
          fx={step.fx}
          fxKey={step.fxKey}
          busy={step.view.activeSeat !== 0}
          turnDurationMs={15_000}
          turnClockKey={step.fxKey}
        />
      </Profiler>
      {/* The driver publishes its own progress so a harness can assert the rig
          actually ran rather than trusting a wall clock. */}
      <span data-testid="stress-burst" hidden>
        {step.fxKey}
      </span>
      {bench && (
        <span data-testid="stress-bench" hidden>
          {JSON.stringify(bench)}
        </span>
      )}
    </>
  );
}

export interface BenchResult {
  bursts: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** React's own render and commit, and the effects it runs on the way out. */
  reactMs: number;
  /** The render phase alone, as React measures it. */
  renderMs: number;
  /** What `reactMs` has left over: commit, refs, and every effect a burst arms. */
  effectMs: number;
  /** The browser's style recalc and layout for the markup React just wrote. */
  layoutMs: number;
  /** A fixed synthetic workload, timed in the same page. See {@link calibrate}. */
  calibrationMs: number;
  /** `meanMs / calibrationMs`: the score, in units of machine rather than milliseconds. */
  score: number;
  /** Counted rather than timed; null unless `scripts/census-work.js` was installed. */
  work: WorkCensusReading | null;
}

/**
 * The counting harness in `scripts/census-work.js`, if it was installed before
 * the app booted. Timing on a loaded machine proved unreadable — an A/B of two
 * identical builds reported one 13% slower — so the counts are the primary
 * evidence and the milliseconds are a sanity check.
 */
interface WorkCensusReading {
  total: Record<string, number>;
  perBurst: Record<string, number>;
  bursts: number;
}

interface WorkCensus {
  arm(): void;
  read(bursts: number): WorkCensusReading;
}

/**
 * A fixed amount of arithmetic, timed alongside the real work.
 *
 * Milliseconds are not comparable across an afternoon of measuring: this laptop
 * is also running the builds, and the same build measured 22.6ms in one sitting
 * and 26.6ms an hour later — a drift wider than most of the changes worth
 * making. What does not drift is the *ratio* between the table's work and a
 * synthetic loop measured seconds apart on the same core under the same
 * throttle. So every run carries its own yardstick and the score is a multiple
 * of it.
 */
function calibrate(): number {
  const startedAt = performance.now();
  let sink = 0;
  for (let index = 1; index <= 4_000_000; index += 1) {
    sink += Math.sqrt(index) % 7;
  }
  // Consumed so the loop cannot be optimised away.
  if (sink === Number.POSITIVE_INFINITY) throw new Error('unreachable');
  return performance.now() - startedAt;
}

/**
 * Times N bursts of table state, synchronously.
 *
 * `flushSync` makes React's render part of the measurement rather than
 * something that happens later, and reading `offsetHeight` afterwards forces
 * the style recalc and layout that the new markup implies — so what is timed is
 * the whole "new game state → laid-out table" path, which is the part of a
 * stutter the table is responsible for.
 */
function runBench(
  rig: StressRig,
  bursts: number,
  apply: (step: StressStep) => void,
  renderMs: { current: number },
): BenchResult {
  const timings: number[] = [];
  // Split three ways, because each part is moved by different work: rendering
  // shrinks when components stop re-rendering, effects shrink when a burst arms
  // less machinery, and layout shrinks when there is less markup or cheaper CSS.
  let react = 0;
  let layout = 0;
  renderMs.current = 0;
  // The first bursts run through cold code. Sixty-burst runs of an unchanged
  // build disagreed by twenty per cent, because some of them reached optimised
  // code halfway through and some did not — a warmup that is measured is a
  // coin toss dressed as a result. These are run and thrown away.
  const warmup = Math.min(80, Math.floor(bursts / 3));
  // Yardstick either side of the run, so a machine that speeds up or slows down
  // during the sample is caught rather than averaged into the result.
  const calibrationBefore = calibrate();
  const census = (window as unknown as { __workCensus?: WorkCensus }).__workCensus;
  for (let index = 0; index < warmup + bursts; index += 1) {
    // Armed after warmup so first-render work is not charged to the average.
    if (index === warmup) census?.arm();
    const next = rig.next();
    const startedAt = performance.now();
    flushSync(() => apply(next));
    const flushedAt = performance.now();
    void document.body.offsetHeight;
    const laidOutAt = performance.now();
    if (index < warmup) continue;
    react += flushedAt - startedAt;
    layout += laidOutAt - flushedAt;
    timings.push(laidOutAt - startedAt);
  }
  const work = census?.read(bursts) ?? null;
  const render = renderMs.current;
  const calibrationMs = (calibrationBefore + calibrate()) / 2;
  const sorted = [...timings].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  const total = timings.reduce((all, one) => all + one, 0);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    bursts,
    totalMs: round(total),
    meanMs: round(total / bursts),
    p50Ms: round(at(0.5)),
    p95Ms: round(at(0.95)),
    maxMs: round(at(0.99)),
    reactMs: round(react / bursts),
    renderMs: round(render / bursts),
    effectMs: round((react - render) / bursts),
    layoutMs: round(layout / bursts),
    calibrationMs: round(calibrationMs),
    // The median, not the mean: one garbage collection in three hundred bursts
    // moves a mean by more than most of the changes being weighed.
    score: round(at(0.5) / calibrationMs),
    work,
  };
}
