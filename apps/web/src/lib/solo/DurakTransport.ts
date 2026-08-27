import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createDurakDef,
  DURAK_BOTS,
  durakTierBot,
  type DurakRules,
  type DurakState,
} from '@parlour/game-durak';
import type { DurakModeId } from '@/lib/durak/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const DURAK_CAST = [
  { name: 'Zina', avatarId: 'slate' },
  { name: 'Volk', avatarId: 'cobalt' },
  { name: 'Petya', avatarId: 'marigold' },
  { name: 'Rust', avatarId: 'rust' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface DurakPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface DurakTransportOptions {
  mode: DurakModeId;
  seats: number;
  seed: number;
  player: { name: string; avatarId: string };
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: DurakRules;
  botTier?: BotTier;
}

export interface DurakSnapshot {
  mode: DurakModeId;
  players: readonly DurakPlayer[];
  session: GameSession<DurakState, DurakRules>;
  /** null while the hand is still live */
  matchWinner: number | null;
}

export type DurakDispatch = SoloDispatch<DurakSnapshot>;

/**
 * In-process authority for solo Durak.
 *
 * A hand is the whole match — one deterministic engine session, no round
 * wrapper — so this facade only projects snapshots and names the house seats.
 */
export class DurakTransport {
  private readonly def = createDurakDef({ bots: DURAK_BOTS });
  private readonly options: DurakTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<DurakState, DurakRules>,
    DurakSnapshot,
    DurakState
  >;

  constructor(options: DurakTransportOptions) {
    this.options = options;
    const policy = durakTierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): DurakSnapshot => ({
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
          legalMoves: (live, seat) => this.def.flow.legalMovesFor!(live.state, live.phase, seat),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          policy: () => policy,
          rngFork: (live) => `ev:${live.log.length}`,
          untilHumanGuard: 500,
          botRejectedMessage: ({ choice, rejected }) => `${choice.id}: ${rejected.message}`,
        },
      },
      session,
    );
  }

  getSnapshot(): DurakSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves the local seat may choose from right now. */
  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return this.def.flow.legalMovesFor!(session.state, session.phase, 0);
  }

  dispatch(move: string, payload?: unknown): DurakDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): DurakDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): DurakDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): DurakPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...DURAK_CAST[index % DURAK_CAST.length]!,
        isBot: true,
      })),
    ];
  }
}
