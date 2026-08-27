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
  canAutoFinish,
  createHintPlanner,
  freecellGame,
  freecellPlayerView,
  legalMovesFor,
  type FreecellHint,
  type HintPlanner,
  type FreecellPlayerView,
  type FreecellRules,
  type FreecellState,
} from '@parlour/game-freecell';
import type { FreecellModeId } from '@/lib/freecell/modes';

type LiveSession = GameSession<FreecellState, FreecellRules>;
export interface PublicFreecellSession {
  state: FreecellPlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface FreecellSnapshot {
  mode: FreecellModeId;
  dailyKey: string | null;
  session: PublicFreecellSession;
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
  hint: FreecellHint | null;
}

export interface FreecellDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: FreecellSnapshot;
}

export interface FreecellTransportOptions {
  mode: FreecellModeId;
  dailyKey: string | null;
  seed: number;
  rules: FreecellRules;
}

/**
 * Solo FreeCell authority. Unlike turn/bot transports, this facade owns its
 * log so Undo can rebuild from a strict prefix. Every forward action enters
 * through sessionApply and every rewind through the engine's undoSession,
 * which drops a player action together with whatever settle produced from it
 * rather than trimming one event off the end.
 */
export class FreecellTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;
  private readonly planner: HintPlanner;

  constructor(private readonly options: FreecellTransportOptions) {
    this.session = this.freshSession();
    this.planner = createHintPlanner();
  }

  /**
   * The solver-backed hint existed in the pack and nothing ever asked for it —
   * this screen still called the greedy hinter, which ranks each move on local
   * merit and will happily suggest a shuffle back and forth. The planner walks
   * a proven line instead, and the getter defers the search until the hint is
   * actually shown, so a hidden one costs nothing.
   */
  getSnapshot(): FreecellSnapshot {
    const state = freecellPlayerView(this.session.state);
    const undo = undoPolicy(this.session);
    const session = this.session;
    const planner = this.planner;
    let hinted: FreecellHint | null | undefined;
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
      canFinish: this.session.status === 'playing' && canAutoFinish(state),
      get hint(): FreecellHint | null {
        if (hinted === undefined) {
          hinted =
            session.status === 'playing' ? planner.hint(session.state as FreecellState) : null;
        }
        return hinted;
      },
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): FreecellDispatch {
    const outcome = sessionApply(freecellGame, this.session, 0, move, payload);
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

  undo(): FreecellDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(freecellGame, this.session);
    if (this.session.log.length === 0) this.planner.rewind();
    else this.planner.invalidate();
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): FreecellDispatch {
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
  playBotTurn(): FreecellDispatch {
    return this.rejection({ code: 'solo-only', message: 'FreeCell has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(freecellGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): FreecellDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: FreecellDispatch): FreecellDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
