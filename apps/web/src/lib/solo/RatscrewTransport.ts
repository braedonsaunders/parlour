import {
  createSession,
  makeRng,
  sessionApply,
  sessionInject,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type RuleError,
} from '@parlour/engine';
import {
  PERSONA_BY_TIER,
  SLAP_GRACE_MS,
  ratscrewGame,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import { ratscrewModeForRules } from '@/lib/ratscrew/modes';

/** House opponents — reflex personas, one tier step apart around the table. */
const RATSCREW_BOTS = [
  { personaId: 'quinn', name: 'Quinn', avatarId: 'quinn' },
  { personaId: 'bolt', name: 'Bolt', avatarId: 'bolt' },
  { personaId: 'jinx', name: 'Jinx', avatarId: 'jinx' },
] as const;

export interface RatscrewPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface RatscrewTransportOptions {
  seats: number;
  seed: number;
  /** resolved house rules (mode preset + overrides) */
  rules: RatscrewConfig;
  player: { name: string; avatarId: string };
  /** test hook: virtual clock (ms) */
  now?: () => number;
}

export interface RatscrewSnapshot {
  players: readonly RatscrewPlayer[];
  session: GameSession<RatscrewState, RatscrewConfig>;
  mode: ReturnType<typeof ratscrewModeForRules>;
  matchWinner: number | null;
}

export interface RatscrewDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: RatscrewSnapshot;
}

interface ScheduledAction {
  id: number;
  /** authority ms (match-relative) */
  at: number;
  kind: 'flip' | 'slap' | 'close';
  seat: number | null;
  /** race actions die when their window resolves */
  epoch: number;
}

/**
 * In-process real-time authority for solo Rat Screw. The engine stays pure —
 * this class only decides WHEN bot intents land and stamps every event with a
 * monotonic authority time, exactly like the P2P host does for live rooms.
 * Slaps resolve in arrival order; a small fairness grace keeps races honest
 * before the injected `windowClose` ends them.
 */
export class RatscrewTransport {
  private readonly seed: number;
  private readonly personas = new Map<number, (typeof PERSONA_BY_TIER)[number]>();
  private session: GameSession<RatscrewState, RatscrewConfig>;
  private queue: ScheduledAction[] = [];
  private nextActionId = 0;
  private windowEpoch = 0;
  private windowWasOpen = false;
  private atMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly clock: () => number;
  private readonly startedAtMs: number;
  private readonly playerName: string;
  private readonly playerAvatarId: string;
  private readonly seatCount: number;

  constructor(options: RatscrewTransportOptions) {
    this.seed = options.seed | 0;
    this.clock = options.now ?? (() => Date.now());
    this.startedAtMs = this.clock();
    this.playerName = options.player.name.trim() || 'You';
    this.playerAvatarId = options.player.avatarId;
    this.seatCount = options.seats;
    this.session = createSession(ratscrewGame, {
      seed: this.seed,
      config: options.rules,
      seats: options.seats,
    });
    for (let seat = 1; seat < options.seats; seat++) {
      const bot = RATSCREW_BOTS[(seat - 1) % RATSCREW_BOTS.length]!;
      const persona = PERSONA_BY_TIER.find((candidate) => candidate.id === bot.personaId);
      if (!persona) throw new Error(`unknown ratscrew persona: ${bot.personaId}`);
      this.personas.set(seat, persona);
    }
    this.scheduleNext();
  }

  getSnapshot(): RatscrewSnapshot {
    return {
      players: this.players(),
      session: this.session,
      mode: ratscrewModeForRules(this.session.config),
      matchWinner: this.session.result?.winner ?? null,
    };
  }

  /** Moves currently offered to the local seat — including the risk slap. */
  legalMoves(): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    return (
      ratscrewGame.flow.legalMovesFor?.(this.session.state, this.session.phase, 0) ?? []
    );
  }

  /** Human intent (seat 0): flips, risk slaps, anything the flow offers. */
  dispatch(move: string, payload?: unknown): RatscrewDispatch {
    return this.apply(() =>
      sessionApply(ratscrewGame, this.session, 0, move, payload, { atMs: this.stamp() }),
    );
  }

  // -- react surface ---------------------------------------------------------

  private readonly listeners = new Set<() => void>();
  private recentFx: FxEvent[] = [];

  /** Fires after every board change, including bot reflexes and window closes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Hands the freshest fx batch to the UI and clears it. */
  drainRecentFx(): readonly FxEvent[] {
    const drained = this.recentFx;
    this.recentFx = [];
    return drained;
  }

  private notify(fx?: readonly FxEvent[]): void {
    if (fx && fx.length > 0) this.recentFx.push(...fx);
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }

  // -- internals ------------------------------------------------------------

  /** Monotonic authority time: never regresses, even if the wall clock does. */
  private stamp(): number {
    const elapsed = Math.max(0, Math.round(this.clock() - this.startedAtMs));
    this.atMs = Math.max(this.atMs + 1, elapsed);
    return this.atMs;
  }

  private apply(
    attempt: () => ReturnType<
      typeof sessionApply<RatscrewState, RatscrewConfig>
    >,
  ): RatscrewDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('match-ended', 'the match has ended');
    }
    const outcome = attempt();
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    this.observeBoard();
    this.scheduleNext();
    this.notify(outcome.fx);
    return {
      events: outcome.events,
      fx: outcome.fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    };
  }

  private reject(code: string, message: string): RatscrewDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }

  /**
   * Watches applied state so live races arm exactly once and retire cleanly:
   * every fresh slap window schedules bot reflexes plus the authoritative
   * close; resolving it bumps the epoch so stale reflexes self-drop.
   */
  private observeBoard(): void {
    const open = Boolean(this.session.state.window);
    if (!open && this.windowWasOpen) {
      this.windowEpoch += 1;
      this.queue = this.queue.filter((action) => action.epoch === -1);
    }
    this.windowWasOpen = open;
    if (!open || !this.session.state.window) return;
    if (this.queue.some((action) => action.kind === 'close')) return;

    const state = this.session.state;
    const openedAt = state.window!.openedAtMs ?? this.atMs;
    const actors = this.session.phase.actors ?? [];
    for (const seat of actors) {
      const persona = this.personas.get(seat);
      if (!persona) continue; // human seats slap for themselves
      const rng = makeRng(this.seed).fork(`race:${this.windowEpoch}:${seat}`);
      if (rng.float() >= persona.accuracy) continue;
      const delay =
        persona.reactMinMs +
        Math.floor(rng.float() * (persona.reactMaxMs - persona.reactMinMs + 1));
      this.queue.push({
        id: this.nextActionId++,
        at: openedAt + delay,
        kind: 'slap',
        seat,
        epoch: this.windowEpoch,
      });
    }
    this.queue.push({
      id: this.nextActionId++,
      at: openedAt + this.session.config.slapWindowMs + SLAP_GRACE_MS,
      kind: 'close',
      seat: null,
      epoch: this.windowEpoch,
    });
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
  }

  /** Lays down whatever the board needs next: a pending bot flip, or race timing. */
  private scheduleNext(): void {
    if (this.disposed || this.session.status !== 'playing') return;
    const phase = this.session.phase;
    if (phase.phase === 'flip' && phase.actor !== null && this.personas.has(phase.actor)) {
      const seat = phase.actor;
      if (!this.queue.some((action) => action.kind === 'flip' && action.seat === seat)) {
        const persona = this.personas.get(seat)!;
        const rng = makeRng(this.seed).fork(`flip:${this.session.log.length}`);
        const delay =
          persona.reactMinMs +
          Math.floor(rng.float() * (persona.reactMaxMs - persona.reactMinMs + 1));
        this.queue.push({
          id: this.nextActionId++,
          at: this.atMs + delay,
          kind: 'flip',
          seat,
          epoch: -1,
        });
        this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
      }
    }
    this.arm();
  }

  private arm(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    const next = this.queue[0];
    if (!next) return;
    const wait = Math.max(0, next.at - this.atMs);
    this.timer = setTimeout(() => this.fire(), wait);
  }

  private fire(): void {
    if (this.disposed || this.session.status !== 'playing') return;
    this.stamp(); // pull authority time up to "now" before judging lateness
    const due = this.queue.filter((action) => action.at <= this.atMs);
    this.queue = this.queue.filter((action) => action.at > this.atMs);
    for (const action of due) this.perform(action);
    if (this.session.status === 'playing') this.scheduleNext();
  }

  private perform(action: ScheduledAction): void {
    const state = this.session.state;
    if (action.kind === 'close') {
      if (!state.window || this.windowEpoch !== action.epoch) return; // already settled
      this.applyInjected('windowClose');
      return;
    }
    if (action.kind === 'slap') {
      if (!state.window || this.windowEpoch !== action.epoch) return; // race settled
      this.applySeat(action.seat!, 'slap');
      return;
    }
    const phase = this.session.phase;
    if (phase.phase !== 'flip' || phase.actor !== action.seat || state.window) return;
    this.applySeat(action.seat!, 'flip');
  }

  private applySeat(seat: number, move: 'flip' | 'slap'): void {
    const outcome = sessionApply(ratscrewGame, this.session, seat, move, undefined, {
      atMs: this.stamp(),
    });
    if (outcome.rejected) return; // stale reflex; the board moved on
    this.session = outcome.session;
    this.observeBoard();
    this.notify(outcome.fx);
  }

  private applyInjected(move: string): void {
    const outcome = sessionInject(ratscrewGame, this.session, move, undefined, {
      atMs: this.stamp(),
    });
    if (outcome.rejected) return;
    this.session = outcome.session;
    this.observeBoard();
    this.notify(outcome.fx);
  }

  private players(): RatscrewPlayer[] {
    return [
      {
        seat: 0,
        name: this.playerName,
        avatarId: this.playerAvatarId,
        isBot: false,
      },
      ...Array.from({ length: this.seatCount - 1 }, (_, index) => {
        const bot = RATSCREW_BOTS[index % RATSCREW_BOTS.length]!;
        return { seat: index + 1, name: bot.name, avatarId: bot.avatarId, isBot: true };
      }),
    ];
  }
}
