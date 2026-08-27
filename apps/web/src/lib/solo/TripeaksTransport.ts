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
  tripeaksGame,
  tripeaksPlayerView,
  type TripeaksHint,
  type TripeaksPlayerView,
  type TripeaksRules,
  type TripeaksState,
} from '@parlour/game-tripeaks';
import type { TripeaksModeId } from '@/lib/tripeaks/modes';

type LiveSession = GameSession<TripeaksState, TripeaksRules>;
export interface PublicTripeaksSession {
  state: TripeaksPlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface TripeaksSnapshot {
  mode: TripeaksModeId;
  dailyKey: string | null;
  session: PublicTripeaksSession;
  eventCount: number;
  /** True exactly when `undoDepth` is above zero; the two never disagree. */
  canUndo: boolean;
  /**
   * Player actions still on the log, and so the number of times Undo can be
   * pressed. Not the move counter: a move and whatever the flow settled from
   * it come off together, so this counts presses rather than log entries.
   */
  undoDepth: number;
  hint: TripeaksHint | null;
}

export interface TripeaksDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: TripeaksSnapshot;
}

export interface TripeaksTransportOptions {
  mode: TripeaksModeId;
  dailyKey: string | null;
  seed: number;
  rules: TripeaksRules;
}

/**
 * Solo TriPeaks authority. Unlike turn/bot transports, this facade owns its
 * log so Undo can rebuild from a strict prefix. Every forward action still
 * enters through sessionApply and every rewind through the engine's
 * undoSession, which drops a player action together with whatever settle
 * produced from it rather than trimming one event off the end.
 */
export class TripeaksTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;

  constructor(private readonly options: TripeaksTransportOptions) {
    this.session = this.freshSession();
  }

  getSnapshot(): TripeaksSnapshot {
    const state = tripeaksPlayerView(this.session.state);
    const undo = undoPolicy(this.session);
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
      hint: this.session.status === 'playing' ? hintFor(state) : null,
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): TripeaksDispatch {
    const outcome = sessionApply(tripeaksGame, this.session, 0, move, payload);
    if (outcome.rejected) return this.rejection(outcome.rejected);
    this.session = outcome.session;
    return this.publish({
      events: outcome.events,
      fx: outcome.fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  undo(): TripeaksDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(tripeaksGame, this.session);
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): TripeaksDispatch {
    this.session = this.freshSession();
    return this.publish({
      events: [],
      fx: this.session.setupFx ?? [],
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  /** Required by the shared hook; actor 0 means this is never scheduled. */
  playBotTurn(): TripeaksDispatch {
    return this.rejection({ code: 'solo-only', message: 'TriPeaks has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(tripeaksGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): TripeaksDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: TripeaksDispatch): TripeaksDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
