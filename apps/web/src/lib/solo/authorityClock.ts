/**
 * Facade-owned monotonic authority clock. The caller injects `now` — this
 * helper never reads the wall clock itself, and SoloAuthority never calls it.
 */
export function createAuthorityClock(options: {
  now: () => number;
  /** `tick` always advances at least 1ms so simultaneous intents stay ordered. */
  step?: 'hold' | 'tick';
}): { readonly startedAtMs: number; readonly now: () => number; stamp(): number; atMs(): number } {
  const { now } = options;
  const startedAtMs = now();
  let atMs = 0;
  return {
    startedAtMs,
    now,
    atMs: () => atMs,
    stamp() {
      const elapsed = Math.max(0, Math.round(now() - startedAtMs));
      atMs = options.step === 'tick' ? Math.max(atMs + 1, elapsed) : Math.max(atMs, elapsed);
      return atMs;
    },
  };
}
