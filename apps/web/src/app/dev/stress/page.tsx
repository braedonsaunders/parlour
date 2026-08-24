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

import { useEffect, useMemo, useRef, useState } from 'react';
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
    return Number.isFinite(value) ? Math.min(500, Math.max(1, value)) : 0;
  }, [search]);

  const [rig] = useState(() => new StressRig(config));
  const [step, setStep] = useState<StressStep>(() => rig.opening());
  const [bench, setBench] = useState<BenchResult | null>(null);
  const benchRun = useRef(false);

  useEffect(() => {
    if (benchBursts > 0) return;
    const timer = window.setInterval(() => setStep(rig.next()), config.stepMs);
    return () => window.clearInterval(timer);
  }, [benchBursts, config.stepMs, rig]);

  useEffect(() => {
    if (benchBursts === 0 || benchRun.current) return;
    benchRun.current = true;
    // A frame's grace so fonts and the first paint are not charged to burst one.
    const timer = window.setTimeout(() => setBench(runBench(rig, benchBursts, setStep)), 400);
    return () => window.clearTimeout(timer);
  }, [benchBursts, rig]);

  return (
    <>
      <WildTableScreen
        view={step.view}
        fx={step.fx}
        fxKey={step.fxKey}
        busy={step.view.activeSeat !== 0}
        turnDurationMs={15_000}
        turnClockKey={step.fxKey}
      />
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
function runBench(rig: StressRig, bursts: number, apply: (step: StressStep) => void): BenchResult {
  const timings: number[] = [];
  for (let index = 0; index < bursts; index += 1) {
    const next = rig.next();
    const startedAt = performance.now();
    flushSync(() => apply(next));
    void document.body.offsetHeight;
    timings.push(performance.now() - startedAt);
  }
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
  };
}
