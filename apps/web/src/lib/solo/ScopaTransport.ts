import { applyPreset, createSession, type GameSession, type LegalMove } from '@parlour/engine';
import {
  createScopaDef,
  scopaConfig,
  tierBot,
  PERSONAS,
  makePersonaBot,
  type ScopaRules,
  type ScopaState,
} from '@parlour/game-scopa';
import type { ScopaModeId } from '@/lib/scopa/modes';
import type { BotTier } from '@/stores/setup';
import { adaptSessionApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';
import { localSeat } from './seating';

export interface ScopaPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
  personaId?: string;
}

export interface ScopaSnapshot {
  mode: ScopaModeId;
  players: readonly ScopaPlayer[];
  session: GameSession<ScopaState, ScopaRules>;
}

export type ScopaDispatch = SoloDispatch<ScopaSnapshot>;

/**
 * In-process authority for solo Scopa.
 *
 * The pack keeps the whole match — every round, the running score, the dealer
 * rotation — inside one deterministic session, so this is a flat session like
 * Spades rather than a MatchDef.
 */
export class ScopaTransport {
  private readonly def = createScopaDef();
  private readonly options: {
    mode: ScopaModeId;
    seats: number;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  };
  private readonly authority: SoloAuthority<
    GameSession<ScopaState, ScopaRules>,
    ScopaSnapshot,
    ScopaState
  >;

  constructor(options: {
    mode: ScopaModeId;
    seats: number;
    config?: ScopaRules;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  }) {
    this.options = options;
    const tier = options.botTier ?? 2;
    const session = createSession(this.def, {
      seed: options.seed | 0,
      config: options.config ?? applyPreset(scopaConfig, options.mode),
      seats: options.seats,
    });

    this.authority = new SoloAuthority(
      {
        snapshot: (live): ScopaSnapshot => ({
          mode: options.mode,
          players: this.players(),
          session: live,
        }),
        apply: adaptSessionApply(this.def),
        isPlaying: (live) => live.status === 'playing',
        bots: {
          seed: options.seed,
          actor: (live) => (live.state.turn === 0 ? null : live.phase.actor),
          legalMoves: (live, seat) =>
            this.def.flow.legalMovesFor?.(live.state, live.phase, seat) ??
            this.def.flow.legalMoves(live.state, live.phase),
          playerView: (live, seat) => this.def.playerView(live.state, seat),
          // Only the middle tier carries personality; Easy and Hard stay
          // uniform so a player choosing them gets what they asked for.
          policy: (seat: number) =>
            tier === 2 ? makePersonaBot(PERSONAS[(seat - 1) % PERSONAS.length]!.id) : tierBot(tier),
          rngFork: (live, seat) => `round:${live.state.roundNo}:play:${live.log.length}:${seat}`,
          untilHumanGuard: 400,
        },
      },
      session,
    );
  }

  getSnapshot(): ScopaSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves offered to the human seat right now (empty while a bot acts). */
  legalMoves(seat = 0): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing' || session.state.turn !== seat) return [];
    return (
      this.def.flow.legalMovesFor?.(session.state, session.phase, seat) ??
      this.def.flow.legalMoves(session.state, session.phase)
    );
  }

  dispatch(move: string, payload?: unknown): ScopaDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): ScopaDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): ScopaDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  private players(): ScopaPlayer[] {
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

export function scopaConfigForMode(mode: ScopaModeId): ScopaRules {
  return applyPreset(scopaConfig, mode);
}
