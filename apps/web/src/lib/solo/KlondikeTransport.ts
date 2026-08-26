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
  klondikeGame,
  klondikePlayerView,
  legalMovesFor,
  type HintPlanner,
  type KlondikeHint,
  type KlondikePlayerView,
  type KlondikeRules,
  type KlondikeState,
} from '@parlour/game-klondike';
import type { KlondikeModeId } from '@/lib/klondike/modes';

type LiveSession = GameSession<KlondikeState, KlondikeRules>;
export interface PublicKlondikeSession {
  state: KlondikePlayerView;
  phase: LiveSession['phase'];
  status: LiveSession['status'];
  result: LiveSession['result'];
  setupFx?: readonly FxEvent[];
}

export interface KlondikeSnapshot {
  mode: KlondikeModeId;
  dailyKey: string | null;
  session: PublicKlondikeSession;
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
  hint: KlondikeHint | null;
}

export interface KlondikeDispatch {
  events: readonly AppliedEvent[];
  fx: readonly FxEvent[];
  rejected: RuleError | null;
  snapshot: KlondikeSnapshot;
}

export interface KlondikeTransportOptions {
  mode: KlondikeModeId;
  dailyKey: string | null;
  seed: number;
  rules: KlondikeRules;
  /** Winning line from deal search, when the solver already walked one. */
  line?: readonly LegalMove[];
}

/**
 * Solo Klondike authority. Unlike turn/bot transports, this facade owns its
 * log so Undo can rebuild from a strict prefix. Every forward action enters
 * through sessionApply and every rewind through the engine's undoSession,
 * which drops a player action together with whatever settle produced from it
 * rather than trimming one event off the end.
 */
export class KlondikeTransport {
  private readonly listeners = new Set<() => void>();
  private readonly planner: HintPlanner;
  private session: LiveSession;

  constructor(private readonly options: KlondikeTransportOptions) {
    this.planner = createHintPlanner(options.line ?? []);
    this.session = this.freshSession();
  }

  /**
   * Klondike's hint is the one expensive thing on this screen.
   *
   * The planner walks a cached winning line for free, but the moment a player
   * deviates from it — which is most moves — it falls through to a fresh
   * `solveKlondike`, a 200k-node search. That ran on EVERY snapshot, so every
   * card sent to a foundation and every stock flip paid for a hint the table
   * then threw away: the screen reads `hint` only while the hint is actually
   * being shown. It is why Klondike felt heavy and the other solitaires, which
   * carry the cheap greedy hinter, did not.
   *
   * The getter defers the search to the first read and memoises it per
   * snapshot, so a hidden hint costs nothing and a shown one costs one solve.
   */
  getSnapshot(): KlondikeSnapshot {
    const state = klondikePlayerView(this.session.state);
    const undo = undoPolicy(this.session);
    const session = this.session;
    const planner = this.planner;
    let hinted: KlondikeHint | null | undefined;
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
      get hint(): KlondikeHint | null {
        if (hinted === undefined) {
          hinted = session.status === 'playing' ? planner.hint(session.state) : null;
        }
        return hinted;
      },
    };
  }

  legalMoves(): readonly LegalMove[] {
    return this.session.status === 'playing' ? legalMovesFor(this.session.state) : [];
  }

  dispatch(move: string, payload?: unknown): KlondikeDispatch {
    const outcome = sessionApply(klondikeGame, this.session, 0, move, payload);
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

  undo(): KlondikeDispatch {
    if (!undoPolicy(this.session).available) {
      return this.rejection({ code: 'nothing-to-undo', message: 'No move to undo yet.' });
    }
    this.session = undoSession(klondikeGame, this.session);
    if (this.session.log.length === 0) this.planner.rewind();
    else this.planner.invalidate();
    return this.publish({ events: [], fx: [], rejected: null, snapshot: this.getSnapshot() });
  }

  restart(): KlondikeDispatch {
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
  playBotTurn(): KlondikeDispatch {
    return this.rejection({ code: 'solo-only', message: 'Klondike has no bot turn.' });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private freshSession(): LiveSession {
    return createSession(klondikeGame, {
      seed: this.options.seed,
      config: this.options.rules,
      seats: 1,
    });
  }

  private rejection(rejected: RuleError): KlondikeDispatch {
    return { events: [], fx: [], rejected, snapshot: this.getSnapshot() };
  }

  private publish(outcome: KlondikeDispatch): KlondikeDispatch {
    for (const listener of this.listeners) listener();
    return outcome;
  }
}
