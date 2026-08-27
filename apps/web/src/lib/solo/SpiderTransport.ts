import {
  createSession,
  undoPolicy,
  undoSession,
  sessionApply,
  type AppliedEvent,
  type FxEvent,
  type GameSession,
  type LegalMove,
  type RuleError,
} from '@parlour/engine';
import {
  createHintPlanner,
  type HintPlanner,
  legalMovesFor,
  spiderGame,
  spiderPlayerView,
  type SpiderHint,
  type SpiderPlayerView,
  type SpiderRules,
  type SpiderState,
} from '@parlour/game-spider';
import type { SpiderModeId } from '@/lib/spider/modes';
import { attachDeferredHint } from './deferHint';

type LiveSession = GameSession<SpiderState, SpiderRules>;
export interface PublicSpiderSession {
  state: SpiderPlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface SpiderSnapshot {
  mode: SpiderModeId;
  dailyKey: string | null;
  session: PublicSpiderSession;
  eventCount: number;
  /** True exactly when `undoDepth` is above zero; the two never disagree. */
  canUndo: boolean;
  /**
   * Player actions still on the log, and so the number of times Undo can be
   * pressed. Not the move counter: a move and whatever the flow settled from
   * it come off together, so this counts presses rather than log entries.
   */
  undoDepth: number;
  canFinish: boolean;
  hint: SpiderHint | null;
}

export interface SpiderDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: SpiderSnapshot;
}

export interface SpiderTransportOptions {
  mode: SpiderModeId;
  dailyKey: string | null;
  seed: number;
  rules: SpiderRules;
}

/**
 * Solo Spider authority. Unlike turn/bot transports, this facade owns its log
 * so Undo can rebuild from a strict prefix. Every forward action still enters
 * through sessionApply and every rewind through the engine's undoSession,
 * which drops a player action together with whatever settle produced from it
 * rather than trimming one event off the end.
 */
export class SpiderTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;
  private readonly planner: HintPlanner;

  constructor(private readonly options: SpiderTransportOptions) {
    this.session = this.freshSession();
    this.planner = createHintPlanner();
  }

  /**
   * The hint is the one expensive thing on this screen, and it is worth it.
   *
   * The greedy hinter ranks each move on local merit alone, so it would suggest
   * shifting a card across and then, next turn, shifting it back — two moves
   * that each score well and cancel out. The solver returns a proven line
   * instead, and the planner walks it for free; only a player leaving that line
   * pays for a fresh search.
   *
   * Deferred and memoised per snapshot, the way Klondike does it. The table
   * view forwards the getter, and the Hint button never reads it — only the
   * on-screen banner does — so a hidden hint costs nothing and a move can
   * animate before anyone asks the solver.
   */
  getSnapshot(): SpiderSnapshot {
    const state = spiderPlayerView(this.session.state);
    const undo = undoPolicy(this.session);
    const session = this.session;
    const planner = this.planner;
    return attachDeferredHint(
      {
        mode: this.options.mode,
        dailyKey: this.options.dailyKey,
        session: {
          state,
          phase: this.session.phase,
          status: this.session.status,
          result: this.session.result,
          setupFx: this.session.setupFx,
        },
        eventCount: this.session.log.length,
        canUndo: undo.available,
        undoDepth: undo.depth,
        canFinish: false,
      },
      () => (session.status === 'playing' ? planner.hint(session.state as SpiderState) : null),
    );
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): SpiderDispatch {
    const outcome = sessionApply(spiderGame, this.session, 0, move, payload);
    if (outcome.rejected) return this.rejection(outcome.rejected);
    this.session = outcome.session;
    this.planner.follow({ id: move, payload });
    return this.publish({
      events: outcome.events,
      fx: outcome.fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  undo(): SpiderDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(spiderGame, this.session);
    if (this.session.log.length === 0) this.planner.rewind();
    else this.planner.invalidate();
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): SpiderDispatch {
    this.session = this.freshSession();
    this.planner.rewind();
    return this.publish({
      events: [],
      fx: this.session.setupFx ?? [],
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  /** Required by the shared hook; actor 0 means this is never scheduled. */
  playBotTurn(): SpiderDispatch {
    return this.rejection({ code: 'solo-only', message: 'Spider has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(spiderGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): SpiderDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: SpiderDispatch): SpiderDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
