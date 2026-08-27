import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createPalaceDef,
  palaceBots,
  palaceTierBot,
  type PalaceRules,
  type PalaceState,
} from '@parlour/game-palace';
import type { PalaceModeId } from '@/lib/palace/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const PALACE_CAST = [
  { name: 'Corvin', avatarId: 'slate' },
  { name: 'Hazel', avatarId: 'marigold' },
  { name: 'Pip', avatarId: 'mint' },
  { name: 'Cobalt', avatarId: 'cobalt' },
  { name: 'Rust', avatarId: 'rust' },
] as const;

export interface PalacePlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface PalaceTransportOptions {
  mode: PalaceModeId;
  seats: number;
  seed: number;
  player: { name: string; avatarId: string };
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: PalaceRules;
  botTier?: BotTier;
}

export interface PalaceSnapshot {
  mode: PalaceModeId;
  players: readonly PalacePlayer[];
  session: GameSession<PalaceState, PalaceRules>;
  /** null while the match is still live */
  matchWinner: number | null;
}

export type PalaceDispatch = SoloDispatch<PalaceSnapshot>;

/**
 * In-process authority for solo Palace.
 *
 * The whole match — every round, the banked round wins and the swap phase —
 * lives inside one deterministic engine session, so this facade only projects
 * snapshots and names the house seats. Bots answer the swap phase immediately,
 * which leaves the pacing of every ordinary turn in the human's hands.
 */
export class PalaceTransport {
  private readonly def = createPalaceDef({ bots: palaceBots });
  private readonly options: PalaceTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<PalaceState, PalaceRules>,
    PalaceSnapshot,
    PalaceState
  >;

  constructor(options: PalaceTransportOptions) {
    this.options = options;
    const policy = palaceTierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): PalaceSnapshot => ({
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
          rngFork: (live) => `round:${live.state.round}:ev:${live.log.length}`,
          untilHumanGuard: 500,
          botRejectedMessage: ({ choice, rejected }) => `${choice.id}: ${rejected.message}`,
        },
      },
      session,
    );
  }

  getSnapshot(): PalaceSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves the local seat may choose from right now. */
  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return this.def.flow.legalMovesFor!(session.state, session.phase, 0);
  }

  dispatch(move: string, payload?: unknown): PalaceDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): PalaceDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): PalaceDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): PalacePlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...PALACE_CAST[index % PALACE_CAST.length]!,
        isBot: true,
      })),
    ];
  }
}
