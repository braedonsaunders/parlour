import {
  applyPreset,
  createMatch,
  matchNextRound,
  type GameSession,
  type LegalMove,
  type MatchResult,
  type MatchSession,
} from '@parlour/engine';
import {
  createOhHellMatchDef,
  ohhellConfig,
  PERSONAS,
  makePersonaBot,
  tierBot,
  type OhHellMatchState,
  type OhHellRules,
  type OhHellState,
} from '@parlour/game-ohhell';
import type { OhHellModeId } from '@/lib/ohhell/modes';
import type { BotTier } from '@/stores/setup';
import { adaptMatchApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';
import { localSeat } from './seating';

export interface OhHellPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
  personaId?: string;
}

export interface OhHellSnapshot {
  mode: OhHellModeId;
  /** 1-based round number inside the match */
  round: number;
  /** how many rounds the match will deal in total */
  rounds: number;
  players: readonly OhHellPlayer[];
  /** the live round session */
  hand: GameSession<OhHellState, OhHellRules>;
  scores: readonly number[];
  status: 'playing' | 'round-over' | 'ended';
  roundResult: MatchResult | null;
  matchResult: MatchResult | null;
  matchWinner: number | null;
}

export type OhHellDispatch = SoloDispatch<OhHellSnapshot>;

type OhHellMatch = MatchSession<OhHellState, OhHellRules, OhHellMatchState>;

/**
 * In-process authority for solo Oh Hell.
 *
 * A `MatchDef`, not a flat session, because the hand-size arc *is* the game:
 * `roundConfig` rewrites the deal size and the dealer for every round, and the
 * cumulative score across that arc is what decides the match. Modelled on
 * HeartsTransport, which has the same shape.
 *
 * Seat count is a table setting here rather than a fixed four — Oh Hell is the
 * first title on the shelf that genuinely varies from three to seven.
 */
export class OhHellTransport {
  private readonly matchDef = createOhHellMatchDef();
  private readonly options: {
    mode: OhHellModeId;
    seats: number;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  };
  private readonly authority: SoloAuthority<OhHellMatch, OhHellSnapshot, OhHellState>;

  constructor(options: {
    mode: OhHellModeId;
    seats: number;
    /** resolved house rules (mode preset + any host overrides) */
    config?: OhHellRules;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  }) {
    this.options = options;
    const tier = options.botTier ?? 2;
    const session = createMatch(this.matchDef, {
      seed: options.seed | 0,
      config: options.config ?? applyPreset(ohhellConfig, options.mode),
      seats: options.seats,
    }).session;

    this.authority = new SoloAuthority(
      {
        snapshot: (live): OhHellSnapshot => ({
          mode: options.mode,
          round: live.roundIndex + 1,
          rounds: live.match.schedule.length,
          players: this.players(),
          hand: live.round,
          scores: [...live.match.scores],
          status: live.status,
          roundResult: live.history.at(-1) ?? null,
          matchResult: live.result,
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptMatchApply(this.matchDef),
        isPlaying: (live) => live.status === 'playing',
        ended: { code: 'round-over', message: 'the round is over — deal the next one' },
        bots: {
          seed: options.seed,
          actor: (live) => this.pendingBotSeat(live),
          legalMoves: (live, seat) =>
            this.matchDef.game.flow.legalMovesFor?.(live.round.state, live.round.phase, seat) ??
            this.matchDef.game.flow.legalMoves(live.round.state, live.round.phase),
          playerView: (live, seat) => this.matchDef.game.playerView(live.round.state, seat),
          // House seats get distinct personas so bidding temperament reads
          // differently around the table; the human's requested tier decides
          // how sharply they all play.
          policy: (seat: number) => this.policyForSeat(seat, tier),
          rngFork: (live, seat) =>
            `round:${live.roundIndex}:event:${live.round.log.length}:${seat}`,
          untilHumanGuard: 400,
        },
      },
      session,
    );
  }

  getSnapshot(): OhHellSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves offered to the human seat right now (empty while others act). */
  legalMovesForSeat(seat = 0): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const { state, phase } = session.round;
    if (phase.actor !== seat) return [];
    return (
      this.matchDef.game.flow.legalMovesFor?.(state, phase, seat) ??
      this.matchDef.game.flow.legalMoves(state, phase)
    );
  }

  dispatch(move: string, payload?: unknown): OhHellDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): OhHellDispatch {
    return this.authority.playBotTurn();
  }

  playBotsUntilHuman(): OhHellDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  /** Opens the next round of the match (round-over only). */
  startNextRound(): OhHellDispatch {
    const session = this.authority.getLive();
    if (session.status === 'ended') {
      return this.authority.reject('match-ended', 'the match has ended');
    }
    if (session.status !== 'round-over') {
      return this.authority.reject('round-playing', 'the current round is not over');
    }
    const outcome = matchNextRound(this.matchDef, session);
    if (outcome.rejected) {
      return this.authority.reject(outcome.rejected.code, outcome.rejected.message);
    }
    return this.authority.accept({
      live: outcome.session,
      events: [],
      fx: outcome.fx,
      rejected: outcome.rejected,
    });
  }

  private pendingBotSeat(session: OhHellMatch): number | null {
    if (session.status !== 'playing') return null;
    const actor = session.round.phase.actor;
    return actor === null || actor === 0 ? null : actor;
  }

  private policyForSeat(seat: number, tier: BotTier) {
    // Tier 2 is the only tier with room for personality: Easy and Hard are
    // deliberately uniform so a player choosing them gets what they asked for
    // rather than a table that happens to contain one sharp seat.
    if (tier !== 2) return tierBot(tier);
    return makePersonaBot(PERSONAS[(seat - 1) % PERSONAS.length]!.id);
  }

  private players(): OhHellPlayer[] {
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

export function ohhellConfigForMode(mode: OhHellModeId): OhHellRules {
  return applyPreset(ohhellConfig, mode);
}
