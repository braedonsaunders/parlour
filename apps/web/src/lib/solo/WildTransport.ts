import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  wildpileGame,
  wildpileTierBot,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import type { WildModeId } from '@/lib/wild/modes';
import type { BotTier, SeatCount } from '@/stores/setup';
import { createAuthorityClock } from './authorityClock';
import {
  adaptSessionApply,
  adaptSessionInject,
  SoloAuthority,
  type SoloDispatch,
} from './SoloAuthority';
import { localSeat } from './seating';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const WILD_BOTS = [
  { name: 'Slate', avatarId: 'slate' },
  { name: 'Marigold', avatarId: 'marigold' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface WildPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface WildTransportOptions {
  mode: WildModeId;
  seats: SeatCount;
  seed: number;
  player: { name: string; avatarId: string };
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: WildpileRules;
  botTier?: BotTier;
  /** Test hook for replay-stable authority time. */
  now?: () => number;
}

export interface WildSnapshot {
  mode: WildModeId;
  players: readonly WildPlayer[];
  session: GameSession<WildpileState, WildpileRules>;
  /** Wild is a single deal: the first emptied hand wins the match. */
  matchWinner: number | null;
}

export type WildDispatch = SoloDispatch<WildSnapshot>;

/**
 * In-process authority for solo Wild. One deterministic deal of
 * @parlour/game-wildpile; timeouts and bot turns reuse the shared session
 * authority and a hold-step clock.
 */
export class WildTransport {
  private readonly def = wildpileGame;
  private readonly options: WildTransportOptions;
  private readonly clock: ReturnType<typeof createAuthorityClock>;
  private readonly authority: SoloAuthority<
    GameSession<WildpileState, WildpileRules>,
    WildSnapshot,
    WildpileState
  >;

  constructor(options: WildTransportOptions) {
    this.options = options;
    this.clock = createAuthorityClock({ now: options.now ?? (() => Date.now()), step: 'hold' });
    const policy = wildpileTierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
    const meta = () => ({ atMs: this.clock.stamp() });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): WildSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptSessionApply(this.def, meta),
        inject: adaptSessionInject(this.def, meta),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live) => this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => policy,
          rngFork: (live) => `event:${live.log.length}`,
          untilHuman: (live) => live.status === 'playing' && live.phase.actor !== 0,
          untilHumanGuard: 500,
        },
      },
      session,
    );
  }

  getSnapshot(): WildSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): WildDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): WildDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): WildDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  timeoutTurn(actor: number): WildDispatch {
    return this.authority.inject('timeout', { kind: 'turn', actor });
  }

  timeoutMatch(): WildDispatch {
    return this.authority.inject('timeout', { kind: 'match' });
  }

  matchEndsAt(): number {
    return this.clock.startedAtMs + this.authority.getLive().config.matchTimeMinutes * 60_000;
  }

  private players(): WildPlayer[] {
    return [
      localSeat(this.options.player),
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...WILD_BOTS[index % WILD_BOTS.length]!,
        isBot: true,
      })),
    ];
  }
}
