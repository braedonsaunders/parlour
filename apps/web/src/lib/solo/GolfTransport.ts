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
  hintFor,
  legalMovesFor,
  type GolfHint,
  type GolfPlayerView,
  type GolfRules,
  type GolfState,
} from '@parlour/game-golf';
import type { GolfModeId } from '@/lib/golf/modes';

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
  canUndo: boolean;
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

  constructor(private readonly options: GolfTransportOptions) {
    this.session = this.freshSession();
  }

  getSnapshot(): GolfSnapshot {
    const state = golfPlayerView(this.session.state);
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

  dispatch(move: string, payload?: unknown): GolfDispatch {
    const outcome = sessionApply(golfGame, this.session, 0, move, payload);
    if (outcome.rejected) return this.rejection(outcome.rejected);
    this.session = outcome.session;
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
