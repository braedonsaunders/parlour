import {
  chooseBotMove,
  makeRng,
  matchApply,
  sessionApply,
  sessionInject,
  type AppliedEvent,
  type ApplyMeta,
  type BotPolicy,
  type FxEvent,
  type GameDef,
  type GameSession,
  type LegalMove,
  type MatchDef,
  type MatchSession,
  type RuleError,
  type RuleValues,
} from '@parlour/engine';

export interface SoloDispatch<TSnapshot> {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: TSnapshot;
}

export interface SoloApplyResult<TLive> {
  live: TLive;
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected?: RuleError;
}

export type SoloApplyFn<TLive> = (
  live: TLive,
  seat: number,
  move: string,
  payload?: unknown,
) => SoloApplyResult<TLive>;

export type SoloInjectFn<TLive> = (
  live: TLive,
  move: string,
  payload?: unknown,
) => SoloApplyResult<TLive>;

export interface SoloAfterApplyResult<TLive> {
  live?: TLive;
  events?: readonly AppliedEvent[];
  fx?: readonly FxEvent[];
}

export interface TurnBasedBots<TLive, TView> {
  seed: number;
  actor(live: TLive): number | null;
  legalMoves(live: TLive, seat: number): readonly LegalMove[];
  playerView(live: TLive, seat: number): TView;
  policy(seat: number): BotPolicy<TView>;
  rngFork(live: TLive, seat: number): string;
  /** Default: live is playing, actor is a non-human seat. */
  hasTurn?(live: TLive): boolean;
  /** Default: keep looping while a non-human seat is acting. */
  untilHuman?(live: TLive): boolean;
  untilHumanGuard?: number;
  untilHumanMessage?: string;
  notBotTurn?: { code: string; message: string };
  /**
   * Soft reject when `isPlaying` is false. Defaults to `notBotTurn` so Blitz
   * and the session games keep saying "no bot is currently acting". Cribbage
   * overrides this with match-ended.
   */
  stopped?: RuleError;
  botRejectedMessage?(ctx: {
    policy: BotPolicy<TView>;
    choice: LegalMove;
    rejected: RuleError;
  }): string;
}

export interface SoloAuthoritySpec<TLive, TSnapshot, TView = never> {
  snapshot(live: TLive): TSnapshot;
  apply: SoloApplyFn<TLive>;
  inject?: SoloInjectFn<TLive>;
  isPlaying(live: TLive): boolean;
  /**
   * Extra closed-door check before a human dispatch (e.g. a finished match
   * whose current round session is still 'playing').
   */
  blockDispatch?(live: TLive): RuleError | null;
  /** Rejection used when `isPlaying` is false. */
  ended?: RuleError | ((live: TLive) => RuleError);
  afterApply?(ctx: {
    live: TLive;
    events: AppliedEvent[];
    fx: FxEvent[];
  }): SoloAfterApplyResult<TLive> | void;
  humanSeat?: number;
  bots?: TurnBasedBots<TLive, TView>;
}

const DEFAULT_ENDED: RuleError = { code: 'match-ended', message: 'the match has ended' };
const DEFAULT_NOT_BOT: RuleError = { code: 'not-bot-turn', message: 'no bot is currently acting' };

/**
 * In-process solo authority written once. Game transports supply typed live
 * state, snapshot projection, and (optionally) turn-based bot scheduling.
 * Rat Screw omits `bots` and keeps its real-time reflex queue on the facade.
 */
export class SoloAuthority<TLive, TSnapshot, TView = never> {
  private live: TLive;
  private readonly listeners = new Set<(outcome: SoloDispatch<TSnapshot>) => void>();
  private recentFx: FxEvent[] = [];
  private readonly humanSeat: number;

  constructor(
    private readonly spec: SoloAuthoritySpec<TLive, TSnapshot, TView>,
    live: TLive,
  ) {
    this.live = live;
    this.humanSeat = spec.humanSeat ?? 0;
  }

  getLive(): TLive {
    return this.live;
  }

  getSnapshot(): TSnapshot {
    return this.spec.snapshot(this.live);
  }

  subscribe(listener: (outcome: SoloDispatch<TSnapshot>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  drainRecentFx(): readonly FxEvent[] {
    const drained = this.recentFx;
    this.recentFx = [];
    return drained;
  }

  dispatch(move: string, payload?: unknown): SoloDispatch<TSnapshot> {
    const blocked = this.spec.blockDispatch?.(this.live);
    if (blocked) return this.reject(blocked.code, blocked.message);
    if (!this.spec.isPlaying(this.live)) {
      const ended = this.endedRejection();
      return this.reject(ended.code, ended.message);
    }
    return this.applyMove(this.humanSeat, move, payload);
  }

  applyMove(seat: number, move: string, payload?: unknown): SoloDispatch<TSnapshot> {
    return this.commit(this.spec.apply(this.live, seat, move, payload), { soft: true });
  }

  tryApplyMove(seat: number, move: string, payload?: unknown): SoloDispatch<TSnapshot> | null {
    return this.commitSilent(this.spec.apply(this.live, seat, move, payload));
  }

  inject(move: string, payload?: unknown): SoloDispatch<TSnapshot> {
    if (!this.spec.inject) throw new Error('this authority does not accept injected events');
    return this.commit(this.spec.inject(this.live, move, payload), { soft: true });
  }

  tryInject(move: string, payload?: unknown): SoloDispatch<TSnapshot> | null {
    if (!this.spec.inject) throw new Error('this authority does not accept injected events');
    return this.commitSilent(this.spec.inject(this.live, move, payload));
  }

  accept(result: SoloApplyResult<TLive>): SoloDispatch<TSnapshot> {
    return this.commit(result, { soft: true });
  }

  reject(code: string, message: string): SoloDispatch<TSnapshot> {
    return { events: [], fx: [], rejected: { code, message }, snapshot: this.getSnapshot() };
  }

  publish(outcome: SoloDispatch<TSnapshot>): SoloDispatch<TSnapshot> {
    if (outcome.fx.length > 0) this.recentFx.push(...outcome.fx);
    for (const listener of this.listeners) listener(outcome);
    return outcome;
  }

  playBotTurn(): SoloDispatch<TSnapshot> {
    const bots = this.requireBots();
    const live = this.live;
    if (!this.spec.isPlaying(live)) {
      const closed = bots.stopped ?? bots.notBotTurn ?? DEFAULT_NOT_BOT;
      return this.reject(closed.code, closed.message);
    }
    const seat = bots.actor(live);
    const hasTurn = bots.hasTurn?.(live) ?? this.defaultHasTurn(live, seat);
    if (!hasTurn || seat === null) {
      const closed = bots.notBotTurn ?? DEFAULT_NOT_BOT;
      return this.reject(closed.code, closed.message);
    }
    const policy = bots.policy(seat);
    const legal = bots.legalMoves(live, seat);
    if (legal.length === 0) throw new Error(`bot seat ${seat} has no legal move`);
    const rng = makeRng(bots.seed).fork(bots.rngFork(live, seat));
    const choice =
      chooseBotMove(policy, bots.playerView(live, seat), seat, legal, rng) ?? legal[0]!;
    const applied = this.spec.apply(this.live, seat, choice.id, choice.payload);
    if (applied.rejected) {
      throw new Error(
        bots.botRejectedMessage?.({ policy, choice, rejected: applied.rejected }) ??
          `${policy.id} chose ${choice.id}: ${applied.rejected.message}`,
      );
    }
    return this.commit(applied, { soft: false });
  }

  playBotsUntilHuman(): SoloDispatch<TSnapshot>[] {
    const bots = this.requireBots();
    const outcomes: SoloDispatch<TSnapshot>[] = [];
    const guardLimit = bots.untilHumanGuard ?? 500;
    let guard = 0;
    while (this.shouldPlayBot(bots)) {
      if (guard++ >= guardLimit) {
        throw new Error(
          bots.untilHumanMessage ?? `bot loop did not return control after ${guardLimit} actions`,
        );
      }
      outcomes.push(this.playBotTurn());
    }
    return outcomes;
  }

  private shouldPlayBot(bots: TurnBasedBots<TLive, TView>): boolean {
    if (!this.spec.isPlaying(this.live)) return false;
    if (bots.untilHuman) return bots.untilHuman(this.live);
    const actor = bots.actor(this.live);
    return actor !== null && actor !== this.humanSeat;
  }

  private defaultHasTurn(live: TLive, seat: number | null): boolean {
    return this.spec.isPlaying(live) && seat !== null && seat !== this.humanSeat;
  }

  private requireBots(): TurnBasedBots<TLive, TView> {
    if (!this.spec.bots) throw new Error('this authority does not schedule bot turns');
    return this.spec.bots;
  }

  private endedRejection(): RuleError {
    const ended = this.spec.ended;
    if (!ended) return DEFAULT_ENDED;
    return typeof ended === 'function' ? ended(this.live) : ended;
  }

  private commitSilent(result: SoloApplyResult<TLive>): SoloDispatch<TSnapshot> | null {
    if (result.rejected) return null;
    return this.commit(result, { soft: true });
  }

  private commit(result: SoloApplyResult<TLive>, mode: { soft: boolean }): SoloDispatch<TSnapshot> {
    if (result.rejected) {
      if (mode.soft) return this.reject(result.rejected.code, result.rejected.message);
      throw new Error(result.rejected.message);
    }
    let events = [...result.events];
    let fx = [...result.fx];
    this.live = result.live;
    const extra = this.spec.afterApply?.({ live: this.live, events, fx });
    if (extra?.live !== undefined) this.live = extra.live;
    if (extra?.events) events = [...extra.events];
    if (extra?.fx) fx = [...extra.fx];
    return this.publish({
      events,
      fx,
      rejected: null,
      snapshot: this.spec.snapshot(this.live),
    });
  }
}

export function adaptSessionApply<S, C extends RuleValues>(
  def: GameDef<S, C>,
  meta?: (live: GameSession<S, C>) => ApplyMeta,
): SoloApplyFn<GameSession<S, C>> {
  return (live, seat, move, payload) => {
    const outcome = sessionApply(def, live, seat, move, payload, meta?.(live));
    return {
      live: outcome.session,
      events: outcome.events,
      fx: outcome.fx,
      rejected: outcome.rejected,
    };
  };
}

export function adaptSessionInject<S, C extends RuleValues>(
  def: GameDef<S, C>,
  meta?: (live: GameSession<S, C>) => ApplyMeta,
): SoloInjectFn<GameSession<S, C>> {
  return (live, move, payload) => {
    const outcome = sessionInject(def, live, move, payload, meta?.(live));
    return {
      live: outcome.session,
      events: outcome.events,
      fx: outcome.fx,
      rejected: outcome.rejected,
    };
  };
}

export function adaptMatchApply<S, C extends RuleValues, MS>(
  def: MatchDef<S, C, MS>,
): SoloApplyFn<MatchSession<S, C, MS>> {
  return (live, seat, move, payload) => {
    const outcome = matchApply(def, live, seat, move, payload);
    return {
      live: outcome.session,
      events: outcome.events,
      fx: outcome.fx,
      rejected: outcome.rejected,
    };
  };
}

export function sessionLegalMoves<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  seat: number,
): readonly LegalMove[] {
  if (session.status !== 'playing') return [];
  return (
    def.flow.legalMovesFor?.(session.state, session.phase, seat) ??
    (session.phase.actor === seat ? def.flow.legalMoves(session.state, session.phase) : [])
  );
}
