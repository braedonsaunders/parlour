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
  hintFor,
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
  canUndo: boolean;
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

  constructor(private readonly options: PyramidTransportOptions) {
    this.session = this.freshSession();
  }

  getSnapshot(): PyramidSnapshot {
    const state = pyramidPlayerView(this.session.state);
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
      canUndo: undoPolicy(this.session).available,
      hint: this.session.status === 'playing' ? hintFor(state) : null,
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): PyramidDispatch {
    const outcome = sessionApply(pyramidGame, this.session, 0, move, payload);
    if (outcome.rejected) return this.rejection(outcome.rejected);
    this.session = outcome.session;
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
