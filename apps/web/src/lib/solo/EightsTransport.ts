import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createEightsDef,
  EIGHTS_BOTS,
  eightsTierBot,
  type EightsRules,
  type EightsState,
} from '@parlour/game-eights';
import type { EightsModeId } from '@/lib/eights/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

/** House opponents — names match the avatar cast so the table reads cohesively. */
const EIGHTS_CAST = [
  { name: 'Juniper', avatarId: 'juniper' },
  { name: 'Cobalt', avatarId: 'cobalt' },
  { name: 'Marigold', avatarId: 'marigold' },
  { name: 'Rust', avatarId: 'rust' },
  { name: 'Mint', avatarId: 'mint' },
] as const;

export interface EightsPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface EightsTransportOptions {
  mode: EightsModeId;
  seats: number;
  seed: number;
  player: { name: string; avatarId: string };
  /** Fully resolved table rules. Defaults to the mode's preset when omitted. */
  rules?: EightsRules;
  botTier?: BotTier;
}

export interface EightsSnapshot {
  mode: EightsModeId;
  players: readonly EightsPlayer[];
  session: GameSession<EightsState, EightsRules>;
  /** null while the match is still live */
  matchWinner: number | null;
}

export type EightsDispatch = SoloDispatch<EightsSnapshot>;

/**
 * In-process authority for solo Crazy Eights.
 *
 * The whole match — every deal, the running scores and the dealer rotation —
 * lives inside one deterministic engine session, so this facade only projects
 * snapshots and names the house seats. Bots answer the round-end ready window
 * immediately, which leaves the pacing between deals in the human's hands.
 */
export class EightsTransport {
  private readonly def = createEightsDef({ bots: EIGHTS_BOTS });
  private readonly options: EightsTransportOptions;
  private readonly authority: SoloAuthority<
    GameSession<EightsState, EightsRules>,
    EightsSnapshot,
    EightsState
  >;

  constructor(options: EightsTransportOptions) {
    this.options = options;
    const policy = eightsTierBot(options.botTier ?? 2);
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.rules ?? applyPreset(this.def.configSchema, options.mode),
      seats: options.seats,
    });
    this.authority = new SoloAuthority(
      {
        snapshot: (live): EightsSnapshot => ({
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
          rngFork: (live) => `round:${live.state.roundIndex}:ev:${live.log.length}`,
          untilHumanGuard: 500,
          botRejectedMessage: ({ choice, rejected }) => `${choice.id}: ${rejected.message}`,
        },
      },
      session,
    );
  }

  getSnapshot(): EightsSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves the local seat may choose from right now. */
  legalMoves(): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    return this.def.flow.legalMovesFor!(session.state, session.phase, 0);
  }

  dispatch(move: string, payload?: unknown): EightsDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): EightsDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): EightsDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): EightsPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => ({
        seat: index + 1,
        ...EIGHTS_CAST[index % EIGHTS_CAST.length]!,
        isBot: true,
      })),
    ];
  }
}
