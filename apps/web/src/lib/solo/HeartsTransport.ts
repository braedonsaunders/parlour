import {
  applyPreset,
  chooseBotMove,
  createMatch,
  makeRng,
  matchApply,
  matchNextRound,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type MatchResult,
  type MatchSession,
  type RuleError,
} from '@parlour/engine';
import {
  createHeartsMatchDef,
  heartsConfigSchema,
  heartsPersona,
  type HeartsMatchState,
  type HeartsRules,
  type HeartsState,
} from '@parlour/game-hearts';
import type { HeartsModeId } from '@/lib/hearts/modes';

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

export interface HeartsDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: HeartsSnapshot;
}

type HeartsMatchSession = MatchSession<HeartsState, HeartsRules, HeartsMatchState>;

/**
 * In-process authority for solo Hearts. A deterministic multi-hand match
 * (@parlour/engine MatchDef): rotating passes, cumulative points, game-over at
 * the configured threshold. The React table only renders its snapshots.
 */
export class HeartsTransport {
  private readonly matchDef = createHeartsMatchDef();
  private readonly options: { mode: HeartsModeId; seed: number; player: { name: string; avatarId: string } };
  private session: HeartsMatchSession;

  constructor(options: {
    mode: HeartsModeId;
    /** resolved house rules (mode preset + any host overrides) */
    config?: HeartsRules;
    seed: number;
    player: { name: string; avatarId: string };
  }) {
    this.options = options;
    this.session = createMatch(this.matchDef, {
      seed: options.seed | 0,
      config:
        options.config ??
        applyPreset(heartsConfigSchema, options.mode),
      seats: 4,
    }).session;
  }

  getSnapshot(): HeartsSnapshot {
    const { session } = this;
    return {
      mode: this.options.mode,
      round: session.roundIndex + 1,
      players: this.players(),
      hand: session.round,
      scores: [...session.match.scores],
      status: session.status,
      handResult: session.history.at(-1) ?? null,
      matchResult: session.result,
      matchWinner: session.result?.winner ?? null,
    };
  }

  /** Moves offered to the human seat right now (empty while others act). */
  legalMovesForSeat(seat = 0): readonly LegalMove[] {
    if (this.session.status !== 'playing') return [];
    const { state, phase } = this.session.round;
    return this.matchDef.game.flow.legalMovesFor?.(state, phase, seat) ?? [];
  }

  dispatch(move: string, payload?: unknown): HeartsDispatch {
    if (this.session.status !== 'playing') {
      return this.reject('round-over', 'the hand is over — deal the next one');
    }
    const outcome = matchApply(this.matchDef, this.session, 0, move, payload);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return this.publish(outcome.events, [...outcome.fx], null);
  }

  /** Drives one acting bot decision (a pass pick, a card, a showdown reveal). */
  playBotTurn(): HeartsDispatch {
    const pending = this.pendingBotSeat();
    if (pending === null) return this.reject('not-bot-turn', 'no bot is currently deciding');
    const [seat] = pending;
    const policy = heartsPersona(SEAT_PERSONAS[seat - 1] ?? 'flint').bot;
    const state = this.session.round.state;
    const legal =
      this.matchDef.game.flow.legalMovesFor?.(state, this.session.round.phase, seat) ?? [];
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(this.options.seed).fork(
      `hand:${this.session.roundIndex}:event:${this.session.round.log.length}:${seat}`,
    );
    const view = this.matchDef.game.playerView(state, seat);
    const choice = chooseBotMove(policy, view, seat, legal, rng) ?? legal[0]!;
    const outcome = matchApply(this.matchDef, this.session, seat, choice.id, choice.payload);
    if (outcome.rejected) {
      throw new Error(`${policy.id} chose ${choice.id}: ${outcome.rejected.message}`);
    }
    this.session = outcome.session;
    return this.publish(outcome.events, [...outcome.fx], null);
  }

  /** True when seat 0 owes a decision (its pass pick or its turn). */
  humanPending(): boolean {
    if (this.session.status !== 'playing') return false;
    const { state } = this.session.round;
    if (state.handOver) return true; // nothing to do but score/advance
    if (state.passing) return state.selections[0] === null;
    return state.turn === 0;
  }

  playBotsUntilHuman(): HeartsDispatch[] {
    const outcomes: HeartsDispatch[] = [];
    let guard = 0;
    while (!this.humanPending()) {
      if (guard++ >= 200) throw new Error('bot loop did not reach the human after 200 actions');
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  /** Opens the next hand of the match (round-over only). */
  startNextHand(): HeartsDispatch {
    if (this.session.status === 'ended') {
      return this.reject('match-ended', 'the match has ended');
    }
    if (this.session.status !== 'round-over') {
      return this.reject('hand-playing', 'the current hand is not over');
    }
    const outcome = matchNextRound(this.matchDef, this.session);
    if (outcome.rejected) return this.reject(outcome.rejected.code, outcome.rejected.message);
    this.session = outcome.session;
    return this.publish([], [...outcome.fx], null);
  }

  private pendingBotSeat(): readonly [number] | null {
    if (this.session.status !== 'playing') return null;
    const { state, phase } = this.session.round;
    if (state.handOver) return null;
    if (state.passing) {
      const seat = state.selections.findIndex((picked) => picked === null);
      return seat >= 0 ? [seat as number] : null;
    }
    if (phase.actor === null || phase.actor === 0) return null;
    return [phase.actor];
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

  private publish(
    events: readonly AppliedEvent[],
    fx: readonly FxEvent[],
    rejected: RuleError | null,
  ): HeartsDispatch {
    return { events, fx, rejected, snapshot: this.getSnapshot() };
  }

  private reject(code: string, message: string): HeartsDispatch {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }
}

export function heartsConfigForMode(mode: HeartsModeId): HeartsRules {
  return applyPreset(heartsConfigSchema, mode);
}
