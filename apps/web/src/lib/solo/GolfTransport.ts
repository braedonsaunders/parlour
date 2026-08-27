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
  golfGame,
  golfPlayerView,
  createHintPlanner,
  type HintPlanner,
  legalMovesFor,
  type GolfHint,
  type GolfPlayerView,
  type GolfRules,
  type GolfState,
} from '@parlour/game-golf';
import type { GolfModeId } from '@/lib/golf/modes';
import { attachDeferredHint } from './deferHint';

type LiveSession = GameSession<GolfState, GolfRules>;
export interface PublicGolfSession {
  state: GolfPlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface GolfSnapshot {
  mode: GolfModeId;
  dailyKey: string | null;
  session: PublicGolfSession;
  eventCount: number;
  /** True exactly when `undoDepth` is above zero; the two never disagree. */
  canUndo: boolean;
  /**
   * Player actions still on the log, and so the number of times Undo can be
   * pressed. Not the move counter: a move and whatever the flow settled from
   * it come off together, so this counts presses rather than log entries.
   */
  undoDepth: number;
  hint: GolfHint | null;
}

export interface GolfDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: GolfSnapshot;
}

export interface GolfTransportOptions {
  mode: GolfModeId;
  dailyKey: string | null;
  seed: number;
  rules: GolfRules;
}

/**
 * Solo Golf authority. Unlike turn/bot transports, this facade owns its log
 * so Undo can rebuild from a strict prefix. Every forward action still enters
 * through sessionApply and every rewind through the engine's undoSession,
 * which drops a player action together with whatever settle produced from it
 * rather than trimming one event off the end.
 */
export class GolfTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;
  private readonly planner: HintPlanner;

  constructor(private readonly options: GolfTransportOptions) {
    this.session = this.freshSession();
    this.planner = createHintPlanner();
  }

  getSnapshot(): GolfSnapshot {
    const state = golfPlayerView(this.session.state);
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
      },
      /**
       * Golf is perfect information, so the solver can prove a line out. The
       * greedy hinter took the first column that fits, which is often the one
       * that buries a card the hole needs later. Deferred until shown, so a
       * hidden hint costs nothing.
       */
      () => (session.status === 'playing' ? planner.hint(session.state as GolfState) : null),
    );
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): GolfDispatch {
    const outcome = sessionApply(golfGame, this.session, 0, move, payload);
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

  undo(): GolfDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(golfGame, this.session);
    if (this.session.log.length === 0) this.planner.rewind();
    else this.planner.invalidate();
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): GolfDispatch {
    this.session = this.freshSession();
    return this.publish({
      events: [],
      fx: this.session.setupFx ?? [],
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  /** Required by the shared hook; actor 0 means this is never scheduled. */
  playBotTurn(): GolfDispatch {
    return this.rejection({ code: 'solo-only', message: 'Golf has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(golfGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): GolfDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: GolfDispatch): GolfDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
