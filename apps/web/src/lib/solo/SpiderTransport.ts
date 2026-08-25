import {
  createSession,
  replaySession,
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
  spiderGame,
  spiderPlayerView,
  type SpiderHint,
  type SpiderPlayerView,
  type SpiderRules,
  type SpiderState,
} from '@parlour/game-spider';
import type { SpiderModeId } from '@/lib/spider/modes';

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
  canUndo: boolean;
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
 * through sessionApply and every rewind through replaySession.
 */
export class SpiderTransport {
  private readonly listeners = new Set<() => void>();
  private session: LiveSession;

  constructor(private readonly options: SpiderTransportOptions) {
    this.session = this.freshSession();
  }

  getSnapshot(): SpiderSnapshot {
    const state = spiderPlayerView(this.session.state);
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
      canUndo: this.session.log.length > 0,
      canFinish: false,
      hint: this.session.status === 'playing' ? hintFor(state) : null,
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): SpiderDispatch {
    const outcome = sessionApply(spiderGame, this.session, 0, move, payload);
    if (outcome.rejected) return this.rejection(outcome.rejected);
    this.session = outcome.session;
    return this.publish({
      events: outcome.events,
      fx: outcome.fx,
      rejected: null,
      snapshot: this.getSnapshot(),
    });
  }

  undo(): SpiderDispatch {
    if (this.session.log.length === 0) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = replaySession(spiderGame, this.options.seed, this.session.log.slice(0, -1), {
      config: this.options.rules,
      seats: 1,
    });
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): SpiderDispatch {
    this.session = this.freshSession();
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
