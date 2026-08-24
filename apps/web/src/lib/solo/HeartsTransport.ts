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
  createHeartsMatchDef,
  HEARTS_BOTS,
  heartsConfigSchema,
  heartsPersona,
  type HeartsMatchState,
  type HeartsRules,
  type HeartsState,
} from '@parlour/game-hearts';
import type { HeartsModeId } from '@/lib/hearts/modes';
import type { BotTier } from '@/stores/setup';
import { adaptMatchApply, SoloAuthority, type SoloDispatch } from './SoloAuthority';

/** House opponents — personas map onto the shared avatar cast. */
const SEAT_PERSONAS = ['rose', 'flint', 'dove'] as const;

export interface HeartsPlayer {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface HeartsSnapshot {
  mode: HeartsModeId;
  /** 1-based hand number inside the match */
  round: number;
  players: readonly HeartsPlayer[];
  /** the live hand session */
  hand: GameSession<HeartsState, HeartsRules>;
  scores: readonly number[];
  status: 'playing' | 'round-over' | 'ended';
  /** result of the most recently completed hand */
  handResult: MatchResult | null;
  matchResult: MatchResult | null;
  matchWinner: number | null;
}

export type HeartsDispatch = SoloDispatch<HeartsSnapshot>;

type HeartsMatchSession = MatchSession<HeartsState, HeartsRules, HeartsMatchState>;

/**
 * In-process authority for solo Hearts. A deterministic multi-hand match
 * (@parlour/engine MatchDef): rotating passes, cumulative points, game-over at
 * the configured threshold. Passing uses untilHuman, not phase.actor.
 */
export class HeartsTransport {
  private readonly matchDef = createHeartsMatchDef();
  private readonly options: {
    mode: HeartsModeId;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  };
  private readonly authority: SoloAuthority<HeartsMatchSession, HeartsSnapshot, HeartsState>;

  constructor(options: {
    mode: HeartsModeId;
    /** resolved house rules (mode preset + any host overrides) */
    config?: HeartsRules;
    seed: number;
    player: { name: string; avatarId: string };
    botTier?: BotTier;
  }) {
    this.options = options;
    const policy = HEARTS_BOTS[(options.botTier ?? 2) - 1]!;
    const session = createMatch(this.matchDef, {
      seed: options.seed | 0,
      config: options.config ?? applyPreset(heartsConfigSchema, options.mode),
      seats: 4,
    }).session;
    this.authority = new SoloAuthority(
      {
        snapshot: (live): HeartsSnapshot => ({
          mode: options.mode,
          round: live.roundIndex + 1,
          players: this.players(),
          hand: live.round,
          scores: [...live.match.scores],
          status: live.status,
          handResult: live.history.at(-1) ?? null,
          matchResult: live.result,
          matchWinner: live.result?.winner ?? null,
        }),
        apply: adaptMatchApply(this.matchDef),
        isPlaying: (live) => live.status === 'playing',
        ended: {
          code: 'round-over',
          message: 'the hand is over — deal the next one',
        },
        bots: {
          seed: options.seed,
          actor: (live) => this.pendingBotSeat(live),
          legalMoves: (live, seat) =>
            this.matchDef.game.flow.legalMovesFor?.(live.round.state, live.round.phase, seat) ?? [],
          playerView: (live, seat) => this.matchDef.game.playerView(live.round.state, seat),
          policy: () => policy,
          rngFork: (live, seat) => `hand:${live.roundIndex}:event:${live.round.log.length}:${seat}`,
          hasTurn: (live) => this.pendingBotSeat(live) !== null,
          untilHuman: (live) => live.status === 'playing' && !this.humanPendingFor(live),
          untilHumanGuard: 200,
          untilHumanMessage: 'bot loop did not reach the human after 200 actions',
          notBotTurn: { code: 'not-bot-turn', message: 'no bot is currently deciding' },
        },
      },
      session,
    );
  }

  getSnapshot(): HeartsSnapshot {
    return this.authority.getSnapshot();
  }

  /** Moves offered to the human seat right now (empty while others act). */
  legalMovesForSeat(seat = 0): readonly LegalMove[] {
    const session = this.authority.getLive();
    if (session.status !== 'playing') return [];
    const { state, phase } = session.round;
    return this.matchDef.game.flow.legalMovesFor?.(state, phase, seat) ?? [];
  }

  dispatch(move: string, payload?: unknown): HeartsDispatch {
    return this.authority.dispatch(move, payload);
  }

  playBotTurn(): HeartsDispatch {
    return this.authority.playBotTurn();
  }

  /** True when seat 0 owes a decision (its pass pick or its turn). */
  humanPending(): boolean {
    return this.humanPendingFor(this.authority.getLive());
  }

  playBotsUntilHuman(): HeartsDispatch[] {
    return this.authority.playBotsUntilHuman();
  }

  /** Opens the next hand of the match (round-over only). */
  startNextHand(): HeartsDispatch {
    const session = this.authority.getLive();
    if (session.status === 'ended') {
      return this.authority.reject('match-ended', 'the match has ended');
    }
    if (session.status !== 'round-over') {
      return this.authority.reject('hand-playing', 'the current hand is not over');
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

  private humanPendingFor(session: HeartsMatchSession): boolean {
    if (session.status !== 'playing') return false;
    const { state } = session.round;
    if (state.handOver) return true;
    if (state.passing) return state.selections[0] === null;
    return state.turn === 0;
  }

  private pendingBotSeat(session: HeartsMatchSession): number | null {
    if (session.status !== 'playing') return null;
    const { state, phase } = session.round;
    if (state.handOver) return null;
    if (state.passing) {
      const seat = state.selections.findIndex((picked) => picked === null);
      return seat >= 0 ? seat : null;
    }
    if (phase.actor === null || phase.actor === 0) return null;
    return phase.actor;
  }

  private players(): HeartsPlayer[] {
    return [
      {
        seat: 0,
        name: this.options.player.name.trim() || 'You',
        avatarId: this.options.player.avatarId,
        isBot: false,
      },
      ...SEAT_PERSONAS.map((personaId, index) => {
        const persona = heartsPersona(personaId);
        return {
          seat: index + 1,
          name: persona.meta.name,
          avatarId: persona.meta.avatar,
          isBot: true,
        };
      }),
    ];
  }
}

export function heartsConfigForMode(mode: HeartsModeId): HeartsRules {
  return applyPreset(heartsConfigSchema, mode);
}
