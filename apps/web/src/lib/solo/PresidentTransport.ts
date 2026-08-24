import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  presidentGame,
  presidentBots,
  MIN_SEATS,
  MAX_SEATS,
  type PresidentRules,
  type PresidentState,
} from '@parlour/game-president';
import type { PresidentModeId } from '@/lib/president/modes';
import type { BotTier } from '@/stores/setup';
import {
  adaptSessionApply,
  sessionLegalMoves,
  SoloAuthority,
  type SoloDispatch,
} from './SoloAuthority';
import { localSeat } from './seating';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const PRESIDENT_BOTS = [
  { name: 'Marigold', avatarId: 'marigold' },
  { name: 'Slate', avatarId: 'slate' },
  { name: 'Juniper', avatarId: 'juniper' },
  { name: 'Cobalt', avatarId: 'cobalt' },
  { name: 'Plum', avatarId: 'plum' },
  { name: 'Rust', avatarId: 'rust' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface PresidentPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface PresidentTransportOptions {
  mode: PresidentModeId;
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: PresidentRules;
  seats: number;
  seed: number;
  player: { name: string; avatarId: string };
  botTier?: BotTier;
}

export interface PresidentSnapshot {
  mode: PresidentModeId;
  players: readonly PresidentPlayer[];
  session: GameSession<PresidentState, PresidentRules>;
  matchWinner: number | null;
}

export type PresidentDispatch = SoloDispatch<PresidentSnapshot>;

/**
 * In-process authority for solo President. One deterministic multi-deal match
 * of @parlour/game-president against house bots; this facade projects seats
 * and snapshots onto the shared session authority.
 */
export class PresidentTransport {
  private readonly def = presidentGame;
  private readonly options: PresidentTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<PresidentState, PresidentRules>,
    PresidentSnapshot,
    PresidentState
  >;

  constructor(options: PresidentTransportOptions) {
    if (
      !Number.isInteger(options.seats) ||
      options.seats < MIN_SEATS ||
      options.seats > MAX_SEATS
    ) {
      throw new Error(`president requires ${MIN_SEATS}–${MAX_SEATS} seats`);
    }
    this.options = options;
    const policy = presidentBots[(options.botTier ?? 2) - 1]!;
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): PresidentSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => live.phase.actor,
          legalMoves: (live, seat) => sessionLegalMoves(this.def, live, seat),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => policy,
          rngFork: (live) => `event:${live.log.length}`,
          untilHumanGuard: 2000,
        },
      },
      session,
    );
  }

  getSnapshot(): PresidentSnapshot {
    return this.authority.getSnapshot();
  }

  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): PresidentDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): PresidentDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): PresidentDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): PresidentPlayer[] {
    return [
      localSeat(this.options.player),
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...PRESIDENT_BOTS[index % PRESIDENT_BOTS.length]!,
        isBot: true,
      })),
    ];
  }
}
