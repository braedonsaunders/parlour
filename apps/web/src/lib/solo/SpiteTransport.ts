import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  spiteConfig,
  spiteGame,
  spiteTierBot,
  PERSONAS,
  makePersonaBot,
  type SpiteRules,
  type SpiteState,
} from '@parlour/game-spite';
import type { SpiteModeId } from '@/lib/spite/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';
import { localSeat } from './seating';

export interface SpitePlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
  personaId?: string;
}

export interface SpiteSnapshot {
  mode: SpiteModeId;
  players: readonly SpitePlayer[];
  session: GameSession<SpiteState, SpiteRules>;
  winner: number | null;
}

export type SpiteDispatch = SoloDispatch<SpiteSnapshot>;

/**
 * In-process authority for solo Spite & Malice.
 *
 * A flat session, not a match: one race to empty a payoff pile decides it, so
 * there are no rounds to compose. Modelled on SpadesTransport.
 */
export class SpiteTransport {
  private readonly def = spiteGame;
  private readonly options: {
    mode: SpiteModeId;
    seats: number;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  };
  private readonly authority: SoloAuthority<
    GameSession<SpiteState, SpiteRules>,
    SpiteSnapshot,
    SpiteState
  >;

  constructor(options: {
    mode: SpiteModeId;
    seats: number;
    config?: SpiteRules;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  }) {
    this.options = options;
    const tier = options.botTier ?? 2;
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.config ?? applyPreset(spiteConfig, options.mode),
      seats: options.seats,
    });

    this.authority = new SoloAuthority(
      {
        snapshot: (live): SpiteSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
          winner: live.state.winner,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => (live.state.turn === 0 ? null : live.phase.actor),
          legalMoves: (live) => this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          // Only the middle tier carries personality: Easy and Hard stay
          // uniform so a player choosing them gets what they asked for.
          policy: (seat: number) =>
            tier === 2
              ? makePersonaBot(PERSONAS[(seat - 1) % PERSONAS.length]!.id)
              : spiteTierBot(tier),
          rngFork: (live) => `turn:${live.log.length}`,
          // A Spite turn is many builds then one discard, so a bot's whole turn
          // is a long run of actions before the human sees the table again.
          untilHumanGuard: 800,
        },
      },
      session,
    );
  }

  getSnapshot(): SpiteSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves offered to the human seat right now (empty while a bot acts). */
  legalMoves(seat = 0): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing' || session.state.turn !== seat) return [];
    return this.def.flow.legalMoves(session.state, session.phase);
  }

  dispatch(move: string, payload?: unknown): SpiteDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): SpiteDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): SpiteDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): SpitePlayer[] {
    return [
      localSeat(this.options.player),
      ...Array.from({ length: this.options.seats - 1 }, (_, index) => {
        const persona = PERSONAS[index % PERSONAS.length]!;
        return {
          seat: index + 1,
          name: persona.name,
          avatarId: persona.avatar,
          isBot: true,
          personaId: persona.id,
        };
      }),
    ];
  }
}

export function spiteConfigForMode(mode: SpiteModeId): SpiteRules {
  return applyPreset(spiteConfig, mode);
}
