import {
  createSession,
  makeRng,
  type FxEvent,
  type GameSession,
  type LegalMove,
} from '@parlour/engine';
import {
  PERSONA_BY_TIER,
  SLAP_GRACE_MS,
  ratscrewGame,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import { ratscrewModeForRules } from '@/lib/ratscrew/modes';
import type { BotTier } from '@/stores/setup';
import { createAuthorityClock } from './authorityClock';
import {
  adaptSessionApply,
  adaptSessionInject,
  SoloAuthority,
  type SoloDispatch,
} from './SoloAuthority';

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
  botTier?: BotTier;
}

export interface RatscrewSnapshot {
  players: readonly RatscrewPlayer[];
  session: GameSession<RatscrewState, RatscrewConfig>;
  mode: ReturnType<typeof ratscrewModeForRules>;
  matchWinner: number | null;
}

export type RatscrewDispatch = SoloDispatch<RatscrewSnapshot>;

type RatscrewSession = GameSession<RatscrewState, RatscrewConfig>;

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
 * this class only decides WHEN bot intents land. Session apply, reject,
 * subscribe, and fx drain live on SoloAuthority; the injected clock and the
 * slap/flip/close queue stay here.
 */
export class RatscrewTransport {
  private readonly seed: number;
  private readonly personas = new Map<number, (typeof PERSONA_BY_TIER)[number]>();
  private readonly clock: ReturnType<typeof createAuthorityClock>;
  private readonly authority: SoloAuthority<RatscrewSession, RatscrewSnapshot>;
  private queue: ScheduledAction[] = [];
  private nextActionId = 0;
  private windowEpoch = 0;
  private windowWasOpen = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly playerName: string;
  private readonly playerAvatarId: string;
  private readonly seatCount: number;

  constructor(options: RatscrewTransportOptions) {
    this.seed = options.seed | 0;
    this.clock = createAuthorityClock({ now: options.now ?? (() => Date.now()), step: 'tick' });
    this.playerName = options.player.name.trim() || 'You';
    this.playerAvatarId = options.player.avatarId;
    this.seatCount = options.seats;
    const session = createSession(ratscrewGame, {
      seed: this.seed,
      config: options.rules,
      seats: options.seats,
    });
    const candidates = PERSONA_BY_TIER.filter(
      (candidate) => candidate.tier === (options.botTier ?? 2),
    );
    if (candidates.length === 0) throw new Error('ratscrew ships no bot for that tier');
    for (let seat = 1; seat < options.seats; seat++) {
      this.personas.set(seat, candidates[(seat - 1) % candidates.length]!);
    }
    const meta = () => ({ atMs: this.clock.stamp() });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): RatscrewSnapshot => ({
          players: this.players(),
          session: live,
          mode: ratscrewModeForRules(live.config),
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptSessionApply(ratscrewGame, meta),
        inject: adaptSessionInject(ratscrewGame, meta),
        isPlaying: (live) => live.status === 'playing',
        bufferRecentFx: true,
        afterApply: () => {
          this.observeBoard();
        },
      },
      session,
    );
    this.scheduleNext();
  }

  getSnapshot(): RatscrewSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves currently offered to the local seat — including the risk slap. */
  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return ratscrewGame.flow.legalMovesFor?.(session.state, session.phase, 0) ?? [];
  }

  /** Human intent (seat 0): flips, risk slaps, anything the flow offers. */
  dispatch(move: string, payload?: unknown): RatscrewDispatch {
    const outcome = this.authority.dispatch(move, payload);
    if (!outcome.rejected) this.scheduleNext();
    return outcome;
  }

  /** Fires after every board change, including bot reflexes and window closes. */
  subscribe = (listener: () => void): (() => void) => {
    return this.authority.subscribe(() => listener());
  };

  /** Hands the freshest fx batch to the UI and clears it. */
  drainRecentFx(): readonly FxEvent[] {
    return this.authority.drainRecentFx();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }

  /**
   * Watches applied state so live races arm exactly once and retire cleanly:
   * every fresh slap window schedules bot reflexes plus the authoritative
   * close; resolving it bumps the epoch so stale reflexes self-drop.
   */
  private observeBoard(): void {
    const session = this.authority.getLive();
    const open = Boolean(session.state.window);
    if (!open && this.windowWasOpen) {
      this.windowEpoch += 1;
      this.queue = this.queue.filter((action) => action.epoch === -1);
    }
    this.windowWasOpen = open;
    if (!open || !session.state.window) return;
    if (this.queue.some((action) => action.kind === 'close')) return;

    const openedAt = session.state.window.openedAtMs ?? this.clock.atMs();
    const actors = session.phase.actors ?? [];
    for (const seat of actors) {
      const persona = this.personas.get(seat);
      if (!persona) continue;
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
      at: openedAt + session.config.slapWindowMs + SLAP_GRACE_MS,
      kind: 'close',
      seat: null,
      epoch: this.windowEpoch,
    });
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
  }

  /** Lays down whatever the board needs next: a pending bot flip, or race timing. */
  private scheduleNext(): void {
    const session = this.authority.getLive();
    if (this.disposed || session.status !== 'playing') return;
    const phase = session.phase;
    if (phase.phase === 'flip' && phase.actor !== null && this.personas.has(phase.actor)) {
      const seat = phase.actor;
      if (!this.queue.some((action) => action.kind === 'flip' && action.seat === seat)) {
        const persona = this.personas.get(seat)!;
        const rng = makeRng(this.seed).fork(`flip:${session.log.length}`);
        const delay =
          persona.reactMinMs +
          Math.floor(rng.float() * (persona.reactMaxMs - persona.reactMinMs + 1));
        this.queue.push({
          id: this.nextActionId++,
          at: this.clock.atMs() + delay,
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
    const wait = Math.max(0, next.at - this.clock.atMs());
    this.timer = setTimeout(() => this.fire(), wait);
  }

  private fire(): void {
    if (this.disposed || this.authority.getLive().status !== 'playing') return;
    this.clock.stamp();
    const due = this.queue.filter((action) => action.at <= this.clock.atMs());
    this.queue = this.queue.filter((action) => action.at > this.clock.atMs());
    for (const action of due) this.perform(action);
    if (this.authority.getLive().status === 'playing') this.scheduleNext();
  }

  private perform(action: ScheduledAction): void {
    const state = this.authority.getLive().state;
    if (action.kind === 'close') {
      if (!state.window || this.windowEpoch !== action.epoch) return;
      this.authority.tryInject('windowClose');
      return;
    }
    if (action.kind === 'slap') {
      if (!state.window || this.windowEpoch !== action.epoch) return;
      this.authority.tryApplyMove(action.seat!, 'slap');
      return;
    }
    const phase = this.authority.getLive().phase;
    if (phase.phase !== 'flip' || phase.actor !== action.seat || state.window) return;
    this.authority.tryApplyMove(action.seat!, 'flip');
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
        const persona = this.personas.get(index + 1)!;
        return {
          seat: index + 1,
          name: persona.label,
          avatarId: persona.id === 'rusty' ? 'rust' : persona.id,
          isBot: true,
        };
      }),
    ];
  }
}
