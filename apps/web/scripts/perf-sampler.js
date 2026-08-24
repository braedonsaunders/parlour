/**
 * The in-page frame sampler, as one browser expression.
 *
 * Lives here rather than inside the Playwright spec because two harnesses need
 * it — the frame-budget suite and the ablation sweep — and a sampler that
 * differs between them would make their numbers incomparable. Both read this
 * file and evaluate it verbatim, so there is exactly one definition of what a
 * "slow frame" means.
 *
 * Three measurements, because no one of them survives a headless browser alone:
 *
 * `frames` is what a player feels — rAF deltas — and the noisiest, since
 * headless compositing does not lock to a display's refresh.
 *
 * `blocking` is the stable one. A task posted for N ms from now can only run
 * late, and it runs late by however long the main thread was busy with
 * something else. Engine-agnostic, barely varies between runs, and it is the
 * number a renderer change actually moves.
 *
 * `longTasks` is Chromium-only and diagnostic: which work blocked, not how much.
 */
(() => {
  const ping = 8;
  const startedAt = performance.now();
  const frameDeltas = [];
  const lateness = [];
  const longTasks = [];
  let stopped = false;

  let previous = startedAt;
  const onFrame = (now) => {
    if (stopped) return;
    frameDeltas.push(now - previous);
    previous = now;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  const channel = new MessageChannel();
  let expectedAt = performance.now() + ping;
  channel.port1.onmessage = () => {
    if (stopped) return;
    const now = performance.now();
    lateness.push(Math.max(0, now - expectedAt));
    expectedAt = now + ping;
    setTimeout(() => channel.port2.postMessage(0), ping);
  };
  setTimeout(() => channel.port2.postMessage(0), ping);

  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    observer = null; // WebKit has no long-task timing; `blocking` covers it.
  }

  const percentile = (values, fraction) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
    return Math.round((sorted[index] ?? 0) * 100) / 100;
  };
  const sum = (values) => values.reduce((all, one) => all + one, 0);
  const round = (value) => Math.round(value * 100) / 100;

  window.__perfSampler = {
    stop() {
      stopped = true;
      if (observer) observer.disconnect();
      const seconds = (performance.now() - startedAt) / 1000;
      const burstNode = document.querySelector('[data-testid="stress-burst"]');
      const bursts = burstNode ? Number.parseInt(burstNode.textContent ?? '', 10) : NaN;
      return {
        seconds: round(seconds),
        frames: {
          count: frameDeltas.length,
          fps: round(frameDeltas.length / seconds),
          p50: percentile(frameDeltas, 0.5),
          p95: percentile(frameDeltas, 0.95),
          p99: percentile(frameDeltas, 0.99),
          max: round(Math.max(0, ...frameDeltas)),
          over33: frameDeltas.filter((delta) => delta > 33).length,
          over50: frameDeltas.filter((delta) => delta > 50).length,
        },
        blocking: {
          totalMs: round(sum(lateness)),
          ratio: round(sum(lateness) / (seconds * 1000)),
          p95: percentile(lateness, 0.95),
          max: round(Math.max(0, ...lateness)),
        },
        longTasks: {
          count: longTasks.length,
          totalMs: round(sum(longTasks)),
          max: round(Math.max(0, ...longTasks)),
        },
        bursts: Number.isFinite(bursts) ? bursts : null,
      };
    },
  };
  return true;
})();
