import {
  createSession,
  makeRng,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  type AppliedEvent,
  type BotPolicy,
  type GameSession,
  type MatchResult,
  type Rng,
  type SeatId,
} from '@parlour/engine';
import type { RatscrewConfig } from './config';
import { SLAP_GRACE_MS, ratscrewGame, type RatscrewState } from './game';
import { rankOf } from './patterns';

// ---------------------------------------------------------------------------
// Reaction-time personas (brief: configurable speed/accuracy windows)
// ---------------------------------------------------------------------------

export interface SlapPersona {
  id: string;
  label: string;
  tier: 1 | 2 | 3;
  blurb: string;
  /** reaction window for flips, contested slaps and panic slaps (ms) */
  reactMinMs: number;
  reactMaxMs: number;
  /** probability of contesting a live slap window at all */
  accuracy: number;
  /** per-flip chance of panicking at a "hard fake" and burning a card */
  misSlapChance: number;
}

export const RATSCREW_PERSONAS = {
  rusty: {
    id: 'rusty',
    label: 'Rusty',
    tier: 1,
    blurb: 'Slaps arrive eventually, like the post.',
    reactMinMs: 210,
    reactMaxMs: 450,
    accuracy: 0.72,
    misSlapChance: 0.02,
  },
  quinn: {
    id: 'quinn',
    label: 'Quinn',
    tier: 2,
    blurb: 'Solid reflexes, occasional twitch.',
    reactMinMs: 150,
    reactMaxMs: 430,
    accuracy: 0.64,
    misSlapChance: 0.06,
  },
  bolt: {
    id: 'bolt',
    label: 'Bolt',
    tier: 3,
    blurb: 'First palm on every pile — mostly on purpose.',
    reactMinMs: 120,
    reactMaxMs: 390,
    accuracy: 0.7,
    misSlapChance: 0.13,
  },
  jinx: {
    id: 'jinx',
    label: 'Jinx',
    tier: 3,
    blurb: 'Wildly fast, wildly wrong, wildly fun.',
    reactMinMs: 100,
    reactMaxMs: 420,
    accuracy: 0.58,
    misSlapChance: 0.25,
  },
} satisfies Record<string, SlapPersona>;

export const PERSONA_BY_TIER: readonly SlapPersona[] = [
  RATSCREW_PERSONAS.rusty,
  RATSCREW_PERSONAS.quinn,
  RATSCREW_PERSONAS.bolt,
  RATSCREW_PERSONAS.jinx,
];

/**
 * Engine-facing policy for a persona: flips when asked, slaps whenever the
 * flow offers it. Race TIMING lives in {@link simulateRealtimeGame} — the
 * policy alone just keeps generic harnesses (and bot takeover) honest.
 */
export function botPolicyFor(persona: SlapPersona): BotPolicy<RatscrewState> {
  return {
    id: `ratscrew-${persona.id}`,
    label: persona.label,
    tier: persona.tier,
    persona: {
      name: persona.label,
      avatar: persona.id,
      blurb: persona.blurb,
    },
    chooseMove(_view, _seat, legal) {
      return (
        legal.find((move) => move.id === 'flip') ?? legal.find((move) => move.id === 'slap') ?? null
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Real-time driver: a virtual authority clock over the pure engine
// ---------------------------------------------------------------------------

interface ScheduledAction {
  id: number;
  /** planned virtual time; the logged atMs is derived monotonically from it */
  atMs: number;
  kind: 'flip' | 'slap' | 'close';
  seat: SeatId | null;
  cancelled?: boolean;
}

export interface RealtimeGameOptions {
  seed: number;
  seats: number;
  config?: Partial<RatscrewConfig>;
  /** one persona per seat — sims are bot-only; humans play through transports */
  personas: readonly SlapPersona[];
  maxEvents?: number;
}

export interface RealtimeStats {
  windowsOpened: number;
  windowsContested: number;
  windowsExpired: number;
  slapsWon: number;
  comebacks: number;
  misSlaps: number;
}

export interface RealtimeRecord {
  seed: number;
  seats: number;
  labels: readonly string[];
  events: number;
  result: MatchResult | null;
  winners: readonly SeatId[];
  /** final authority log — feed to replaySession to verify hash stability */
  log: readonly AppliedEvent[];
  finalHash: string | null;
  durationMs: number;
  stats: RealtimeStats;
  stalled?: boolean;
}

function uniformInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng.float() * (max - min + 1));
}

/** True when the top of the pile merely LOOKS slappable — bait for jumpy bots. */
function looksLikeAFake(center: readonly string[]): boolean {
  if (center.length < 2) return false;
  const top = center[center.length - 1]!;
  const under = center[center.length - 2]!;
  if (top[0] === under[0]) return true; // same suit flashes like a double
  const diff = Math.abs(rankOf(top) - rankOf(under));
  if (diff === 1) return true;
  if (center.length >= 3 && rankOf(top) === rankOf(center[center.length - 3]!)) return true;
  return false;
}

/**
 * Plays one full match against a virtual match clock. Every bot decision —
 * flips, contested slaps, panic burns — lands at a seeded reaction time and is
 * fed through the ordinary session runtime in arrival order, exactly like the
 * P2P authority serializes live intents. Deterministic per seed: the log
 * replays hash-identically.
 */
export function simulateRealtimeGame(opts: RealtimeGameOptions): RealtimeRecord {
  const seats = opts.seats;
  if (opts.personas.length !== seats) {
    throw new Error(
      `simulateRealtimeGame: expected ${seats} personas, got ${opts.personas.length}`,
    );
  }
  const maxEvents = opts.maxEvents ?? 20_000;
  const config = ratscrewGame.configSchema.resolve(opts.config ?? {});
  let session: GameSession<RatscrewState, RatscrewConfig> = createSession(ratscrewGame, {
    seed: opts.seed,
    config,
    seats,
  });

  const rng = makeRng(opts.seed).fork('realtime');
  const stats: RealtimeStats = {
    windowsOpened: 0,
    windowsContested: 0,
    windowsExpired: 0,
    slapsWon: 0,
    comebacks: 0,
    misSlaps: 0,
  };

  let clock = 0;
  let lastStamp = -1;
  let nextId = 0;
  const queue: ScheduledAction[] = [];
  /**
   * Adrenaline tax: whoever won the previous race is still riding the spike —
   * hot streaks stack the penalty (×1.5, ×2, ×2.5) so dominant runs cool off
   * exactly like they do across a real table. Without it the pile-winner-leads
   * loop snowballs into a foregone conclusion.
   */
  let lastRaceWinner: SeatId | null = null;
  let winStreak = 0;

  const stamp = (plannedAt: number): number => {
    const next = plannedAt > lastStamp ? plannedAt : lastStamp + 1;
    lastStamp = next;
    return next;
  };
  const schedule = (action: Omit<ScheduledAction, 'id'>): void => {
    queue.push({ ...action, id: nextId++ });
  };
  const cancelTransient = (): void => {
    for (const action of queue) {
      if (!action.cancelled && action.kind !== 'flip') action.cancelled = true;
    }
  };
  const hasPendingFlip = (): boolean =>
    queue.some((action) => action.kind === 'flip' && !action.cancelled);

  const reactDelay = (persona: SlapPersona, seat?: SeatId): number => {
    const base = uniformInt(rng, persona.reactMinMs, persona.reactMaxMs);
    if (seat !== undefined && seat === lastRaceWinner && winStreak > 0) {
      const tax = 1 + 0.5 * Math.min(winStreak, 3);
      return Math.round(base * tax);
    }
    return base;
  };

  /** Queues the turn seat's next flip unless one is already pending. */
  const scheduleNextFlip = (): void => {
    if (session.status !== 'playing' || session.state.window || hasPendingFlip()) return;
    const seat = session.state.turn as SeatId;
    const persona = opts.personas[seat];
    if (!persona) throw new Error(`no persona seated at ${seat}`);
    schedule({ atMs: clock + reactDelay(persona, seat), kind: 'flip', seat });
  };

  /** On a fresh window: every eligible seat rolls reflexes; the close is armed. */
  const openRace = (): void => {
    stats.windowsOpened += 1;
    const actors = session.phase.actors ?? [];
    for (const seat of actors) {
      const persona = opts.personas[seat];
      if (!persona) continue;
      if (rng.float() < persona.accuracy) {
        stats.windowsContested += 1;
        schedule({ atMs: clock + reactDelay(persona, seat), kind: 'slap', seat });
      }
    }
    schedule({
      atMs: clock + config.slapWindowMs + SLAP_GRACE_MS,
      kind: 'close',
      seat: null,
    });
  };

  /** On an unremarkable flip: jumpy personas may swipe at a tempting fake. */
  const rollPanics = (flipper: SeatId): void => {
    for (let seat = 0; seat < seats; seat++) {
      if (seat === flipper) continue;
      const persona = opts.personas[seat];
      if (!persona || (session.state.piles[seat]?.length ?? 0) === 0) continue;
      if (rng.float() >= persona.misSlapChance) continue;
      if (!looksLikeAFake(session.state.center)) continue;
      schedule({ atMs: clock + reactDelay(persona, seat), kind: 'slap', seat });
    }
  };

  const applyQueued = (action: ScheduledAction): void => {
    const atMs = stamp(action.atMs);
    clock = Math.max(clock, action.atMs);
    if (action.kind === 'close') {
      const outcome = sessionInject(ratscrewGame, session, 'windowClose', undefined, { atMs });
      if (outcome.rejected) return; // stale (already resolved)
      session = outcome.session;
      stats.windowsExpired += 1;
      cancelTransient();
      return;
    }

    if (action.kind === 'flip') {
      const phase = session.phase;
      if (phase.phase !== 'flip' || phase.actor !== action.seat || session.state.window) return;
      const outcome = sessionApply(ratscrewGame, session, action.seat!, 'flip', undefined, {
        atMs,
      });
      if (outcome.rejected) return; // turn moved underneath us; regenerate below
      const flippedFrom = action.seat!;
      const hadWindow = Boolean(session.state.window);
      session = outcome.session;
      if (session.state.window && !hadWindow) {
        openRace();
        return; // flips resume after the race resolves
      }
      rollPanics(flippedFrom);
      return;
    }

    // slap — legal either as a race win or a penalty burn
    const racedLive = Boolean(session.state.window);
    const fxKinds = new Set<string>();
    const outcome = sessionApply(ratscrewGame, session, action.seat!, 'slap', undefined, { atMs });
    if (outcome.rejected) return; // stale
    session = outcome.session;
    for (const fx of outcome.fx) fxKinds.add(fx.kind);
    if (fxKinds.has('ratscrew.slap')) {
      stats.slapsWon += 1;
      if (lastRaceWinner === action.seat) winStreak += 1;
      else winStreak = 1;
      lastRaceWinner = action.seat;
      if (fxKinds.has('ratscrew.comeback')) stats.comebacks += 1;
      cancelTransient();
    } else {
      stats.misSlaps += 1;
      if (racedLive) {
        // we lost the race — the pile left under us, so drop stale follow-ups
        cancelTransient();
        lastRaceWinner = null;
        winStreak = 0;
      }
    }
  };

  let applied = 0;
  let consecutiveDrops = 0;
  scheduleNextFlip();
  while (session.status === 'playing') {
    const next = queue
      .filter((action) => !action.cancelled)
      .sort((a, b) => a.atMs - b.atMs || a.id - b.id)[0];
    if (!next) {
      scheduleNextFlip();
      const retry = queue.find((action) => !action.cancelled);
      if (!retry) throw new Error(`realtime driver stalled at seq ${session.log.length}`);
      continue;
    }
    next.cancelled = true;
    const logLengthBefore = session.log.length;
    applied += 1;
    if (applied > maxEvents) {
      return {
        seed: opts.seed,
        seats,
        labels: opts.personas.map((p) => p.id),
        events: session.log.length,
        result: null,
        winners: [],
        log: session.log,
        finalHash: stateHash(session.state),
        durationMs: clock,
        stats,
        stalled: true,
      };
    }
    applyQueued(next);
    scheduleNextFlip();
    // A queue that keeps producing drops without logging is a rules bug —
    // fail loudly instead of spinning to the event cap.
    consecutiveDrops = session.log.length === logLengthBefore ? consecutiveDrops + 1 : 0;
    if (consecutiveDrops > 64) {
      throw new Error(
        `realtime driver dropped ${consecutiveDrops} actions in a row at seq ${session.log.length}`,
      );
    }
  }

  return {
    seed: opts.seed,
    seats,
    labels: opts.personas.map((p) => p.id),
    events: session.log.length,
    result: session.result,
    winners: (session.result?.rankings ?? [])
      .filter((rank) => rank.rank === 1)
      .map((rank) => rank.seat),
    log: session.log,
    finalHash: stateHash(session.state),
    durationMs: clock,
    stats,
  };
}

/** Convenience: proves a record's log reproduces the exact final state. */
export function replaysIdentically(record: RealtimeRecord): boolean {
  const replayed = replaySession(ratscrewGame, record.seed, record.log, {
    config: ratscrewGame.configSchema.resolve({}),
    seats: record.seats,
  });
  return stateHash(replayed.state) === record.finalHash && replayed.status === 'ended';
}
