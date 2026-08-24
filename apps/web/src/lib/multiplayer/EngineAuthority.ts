import {
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  type GameDef,
  type GameSession,
  type RuleValues,
} from '@parlour/engine';
import type {
  AppliedPacket,
  AuthorityAdapter,
  PlayerAction,
  ReplaySnapshot,
  RoomSettings,
} from './types';

/** A veiled room replays from the ceremony order, not from the seeded shuffle. */
function veilOptions(settings: RoomSettings, deckOrder: readonly string[] | undefined) {
  return settings.security === 'veil' ? { veiled: true, deckOrder } : {};
}

type EngineAuthorityOptions<S, C extends RuleValues> = {
  def: GameDef<S, C>;
  session: GameSession<S, C>;
  settings: RoomSettings;
  now?: () => number;
  onSeatBot?: (seat: number, bot: boolean) => void;
};

type AuthorityState<S, C extends RuleValues> = {
  session: GameSession<S, C>;
  settings: RoomSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class EngineAuthority<S, C extends RuleValues> implements AuthorityAdapter {
  private authorityState: AuthorityState<S, C>;
  private acceptedActions = new Map<string, number>();
  private readonly def: GameDef<S, C>;
  private readonly now: () => number;
  private readonly onSeatBot?: (seat: number, bot: boolean) => void;
  private clockAnchorWallMs: number;
  private clockAnchorAtMs = 0;

  constructor(options: EngineAuthorityOptions<S, C>) {
    this.def = options.def;
    this.authorityState = { session: options.session, settings: options.settings };
    this.now = options.now ?? (() => Date.now());
    this.clockAnchorWallMs = this.now();
    this.onSeatBot = options.onSeatBot;
  }

  apply(action: PlayerAction): AppliedPacket {
    if (this.acceptedActions.has(action.id)) throw new DuplicateActionError(action.id);
    const { session, settings } = this.authorityState;
    const { timestamp, atMs } = this.authorityTime(session);
    const outcome = sessionApply(this.def, session, action.seat, action.move, action.payload, {
      atMs,
      reveals: action.reveals,
      conceals: action.conceals,
    });
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    const events = outcome.events.map((event) => ({ ...event, ts: timestamp }));
    const nextSession = { ...outcome.session, log: [...session.log, ...events] };
    this.authorityState = { session: nextSession, settings };
    const lastSeq = events.at(-1)?.seq;
    if (lastSeq === undefined) throw new Error('accepted action produced no replay event');
    this.acceptedActions.set(action.id, lastSeq);
    return {
      actionId: action.id,
      events,
      fx: outcome.fx,
      stateHash: stateHash(nextSession.state),
    };
  }

  inject(actionId: string, move: string, payload?: unknown): AppliedPacket {
    if (this.acceptedActions.has(actionId)) throw new DuplicateActionError(actionId);
    const { session, settings } = this.authorityState;
    const { timestamp, atMs } = this.authorityTime(session);
    const outcome = sessionInject(this.def, session, move, payload, { atMs });
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    const events = outcome.events.map((event) => ({ ...event, ts: timestamp }));
    const nextSession = { ...outcome.session, log: [...session.log, ...events] };
    this.authorityState = { session: nextSession, settings };
    const lastSeq = events.at(-1)?.seq;
    if (lastSeq === undefined) throw new Error('accepted injection produced no replay event');
    this.acceptedActions.set(actionId, lastSeq);
    return {
      actionId,
      events,
      fx: outcome.fx,
      stateHash: stateHash(nextSession.state),
    };
  }

  applyRemote(packet: AppliedPacket): { stateHash: string; accepted: boolean } {
    const { session, settings } = this.authorityState;
    if (this.acceptedActions.has(packet.actionId)) {
      return { stateHash: stateHash(session.state), accepted: false };
    }
    const firstSeq = packet.events[0]?.seq;
    if (firstSeq === undefined || firstSeq !== session.log.length) {
      return { stateHash: stateHash(session.state), accepted: false };
    }
    const nextSession = replaySession(this.def, session.seed, [...session.log, ...packet.events], {
      config: session.config,
      seats: session.seats,
      ...veilOptions(settings, session.deckOrder),
    });
    // Replay reconstructs state/phase from the authoritative events, then keep
    // the packets themselves as the replicated log. In particular, replay's
    // reducer does not manufacture host wall-clock `ts` metadata; dropping it
    // here made guest logs semantically equivalent but not byte-identical.
    this.authorityState = {
      session: { ...nextSession, log: [...session.log, ...packet.events] },
      settings,
    };
    this.acceptedActions.set(packet.actionId, packet.events.at(-1)!.seq);
    return { stateHash: stateHash(nextSession.state), accepted: true };
  }

  exportSnapshot(): ReplaySnapshot {
    const { session, settings } = this.authorityState;
    const snapshot: ReplaySnapshot = {
      seed: session.seed,
      log: [...session.log],
      acceptedActions: [...this.acceptedActions].map(([id, seq]) => ({ id, seq })),
      stateHash: stateHash(session.state),
      settings: { ...settings, config: { ...settings.config } },
    };
    if (session.deckOrder) snapshot.deckOrder = [...session.deckOrder];
    return snapshot;
  }

  importSnapshot(snapshot: ReplaySnapshot): void {
    if (snapshot.settings.gameId !== this.def.id) throw new Error('snapshot game mismatch');
    if (
      !Number.isInteger(snapshot.settings.seats) ||
      snapshot.settings.seats < 2 ||
      snapshot.settings.seats > 4
    ) {
      throw new Error('invalid snapshot seats');
    }
    if (snapshot.settings.security === 'veil' && !snapshot.deckOrder) {
      throw new Error('a veiled snapshot must carry its ceremony deck order');
    }
    const config = this.resolveSnapshotConfig(snapshot.settings.config);
    const replayed = replaySession(this.def, snapshot.seed, snapshot.log, {
      config,
      seats: snapshot.settings.seats,
      ...veilOptions(snapshot.settings, snapshot.deckOrder),
    });
    if (stateHash(replayed.state) !== snapshot.stateHash) throw new Error('snapshot hash mismatch');
    const acceptedActions = new Map<string, number>();
    let previousSeq = -1;
    for (const action of snapshot.acceptedActions) {
      if (
        !action.id ||
        !Number.isInteger(action.seq) ||
        action.seq <= previousSeq ||
        action.seq >= snapshot.log.length ||
        acceptedActions.has(action.id)
      ) {
        throw new Error('invalid accepted action history');
      }
      acceptedActions.set(action.id, action.seq);
      previousSeq = action.seq;
    }
    if (previousSeq !== snapshot.log.length - 1) {
      throw new Error('accepted action history does not cover replay log');
    }
    this.authorityState = {
      session: { ...replayed, log: [...snapshot.log] },
      settings: { ...snapshot.settings, config },
    };
    this.clockAnchorAtMs = snapshot.log.at(-1)?.atMs ?? 0;
    this.clockAnchorWallMs = this.now();
    this.acceptedActions = acceptedActions;
  }

  setSeatBot(seat: number, bot: boolean): void {
    this.onSeatBot?.(seat, bot);
  }

  getSession(): GameSession<S, C> {
    return this.authorityState.session;
  }

  private authorityTime(session: GameSession<S, C>): { timestamp: number; atMs: number } {
    const timestamp = this.now();
    const previousAtMs = session.log.at(-1)?.atMs ?? 0;
    const atMs = Math.max(
      previousAtMs,
      this.clockAnchorAtMs + Math.max(0, Math.trunc(timestamp - this.clockAnchorWallMs)),
    );
    return { timestamp, atMs };
  }

  private resolveSnapshotConfig(value: unknown): C {
    if (!isRecord(value)) throw new Error('invalid snapshot config');
    const fieldKeys = new Set(this.def.configSchema.fields.map((field) => field.key));
    if (Object.keys(value).some((key) => !fieldKeys.has(key))) {
      throw new Error('invalid snapshot config');
    }
    const resolved = this.def.configSchema.resolve(value as Partial<C>);
    for (const [key, given] of Object.entries(value)) {
      if (!Object.is(given, resolved[key])) throw new Error('invalid snapshot config');
    }
    return resolved;
  }
}

export class DuplicateActionError extends Error {
  constructor(actionId: string) {
    super(`duplicate action: ${actionId}`);
    this.name = 'DuplicateActionError';
  }
}
