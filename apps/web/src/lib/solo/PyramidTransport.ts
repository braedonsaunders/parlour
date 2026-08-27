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
  pyramidGame,
  pyramidPlayerView,
  type PyramidHint,
  type PyramidPlayerView,
  type PyramidRules,
  type PyramidState,
} from '@parlour/game-pyramid';
import type { PyramidModeId } from '@/lib/pyramid/modes';

type LiveSession = GameSession<PyramidState, PyramidRules>;
export interface PublicPyramidSession {
  state: PyramidPlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface PyramidSnapshot {
  mode: PyramidModeId;
  dailyKey: string | null;
  session: PublicPyramidSession;
  eventCount: number;
  /** True exactly when `undoDepth` is above zero; the two never disagree. */
  canUndo: boolean;
  /**
   * Player actions still on the log, and so the number of times Undo can be
   * pressed. Not the move counter: a move and whatever the flow settled from
   * it come off together, so this counts presses rather than log entries.
   */
  undoDepth: number;
  hint: PyramidHint | null;
}

export interface PyramidDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: PyramidSnapshot;
}

export interface PyramidTransportOptions {
  mode: PyramidModeId;
  dailyKey: string | null;
  seed: number;
  rules: PyramidRules;
}

/**
 * Solo Pyramid authority. Unlike turn/bot transports, this facade owns its log
 * so Undo can rebuild from a strict prefix. Every forward action still enters
 * through sessionApply and every rewind through the engine's undoSession,
 * which drops a player action together with whatever settle produced from it
 * rather than trimming one event off the end.
 */
export class PyramidTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;
  private readonly planner: HintPlanner;

  constructor(private readonly options: PyramidTransportOptions) {
    this.session = this.freshSession();
    this.planner = createHintPlanner();
  }

  getSnapshot(): PyramidSnapshot {
    const state = pyramidPlayerView(this.session.state);
    const undo = undoPolicy(this.session);
    const session = this.session;
    const planner = this.planner;
    let hinted: PyramidHint | null | undefined;
    return {
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
      /**
       * The losing pair looks exactly like the winning one, so a greedy hint
       * cannot tell them apart. Pyramid is perfect information; the solver can.
       * Deferred until shown, so a hidden hint costs nothing.
       */
      get hint(): PyramidHint | null {
        if (hinted === undefined) {
          hinted =
            session.status === 'playing' ? planner.hint(session.state as PyramidState) : null;
        }
        return hinted;
      },
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): PyramidDispatch {
    const outcome = sessionApply(pyramidGame, this.session, 0, move, payload);
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

  undo(): PyramidDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(pyramidGame, this.session);
    if (this.session.log.length === 0) this.planner.rewind();
    else this.planner.invalidate();
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): PyramidDispatch {
    this.session = this.freshSession();
    return this.publish({
      events: [],
      fx: this.session.setupFx ?? [],
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  /** Required by the shared hook; actor 0 means this is never scheduled. */
  playBotTurn(): PyramidDispatch {
    return this.rejection({ code: 'solo-only', message: 'Pyramid has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(pyramidGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): PyramidDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: PyramidDispatch): PyramidDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
