import {
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  type CardId,
  type GameDef,
  type GameSession,
  type RuleValues,
} from '@parlour/engine';
import { DEFAULT_SEAT_RANGE, type SeatRange } from '@/lib/rooms/seatRange';
import type {
  AppliedPacket,
  AuthorityAdapter,
  PlayerAction,
  RemoteApplyResult,
  ReplaySnapshot,
  RoomSettings,
} from './types';

type EngineAuthorityOptions<S, C extends RuleValues> = {
  def: GameDef<S, C>;
  session: GameSession<S, C>;
  settings: RoomSettings;
  now?: () => number;
  onSeatBot?: (seat: number, bot: boolean) => void;
  /** room capacity bounds for snapshot validation; defaults to the shared 2–4 ring */
  seatsRange?: SeatRange;
};

type AuthorityState<S, C extends RuleValues> = {
  session: GameSession<S, C>;
  settings: RoomSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function veilOptions(settings: RoomSettings, deckOrder: readonly string[] | undefined) {
  return settings.security === 'veil' ? { veiled: true, deckOrder } : {};
}

export class EngineAuthority<S, C extends RuleValues> implements AuthorityAdapter {
  private authorityState: AuthorityState<S, C>;
  private acceptedActions = new Map<string, number>();
  private readonly def: GameDef<S, C>;
  private readonly now: () => number;
  private readonly onSeatBot?: (seat: number, bot: boolean) => void;
  private readonly seatsRange: SeatRange;
  private clockAnchorWallMs: number;
  private clockAnchorAtMs = 0;

  constructor(options: EngineAuthorityOptions<S, C>) {
    this.def = options.def;
    this.authorityState = { session: options.session, settings: options.settings };
    this.now = options.now ?? (() => Date.now());
    this.clockAnchorWallMs = this.now();
    this.onSeatBot = options.onSeatBot;
    this.seatsRange = options.seatsRange ?? DEFAULT_SEAT_RANGE;
  }

  apply(action: PlayerAction): AppliedPacket {
    if (this.acceptedActions.has(action.id)) throw new DuplicateActionError(action.id);
    const { session, settings } = this.authorityState;
    const { timestamp, atMs } = this.authorityTime(session);
    const outcome = sessionApply(this.def, session, action.seat, action.move, action.payload, {
      atMs,
      reveals: action.reveals,
      recycle: action.recycle,
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

  inject(
    actionId: string,
    move: string,
    payload?: unknown,
    reveals?: readonly (readonly [string, string])[],
  ): AppliedPacket {
    if (this.acceptedActions.has(actionId)) throw new DuplicateActionError(actionId);
    const { session, settings } = this.authorityState;
    const { timestamp, atMs } = this.authorityTime(session);
    // Openings are substituted into the state before the move validates, so a
    // street injected with its board sees real cards where handles were.
    const outcome = sessionInject(this.def, session, move, payload, {
      atMs,
      ...(reveals && reveals.length > 0
        ? { reveals: reveals.map(([handle, card]) => [handle, card] as [CardId, CardId]) }
        : {}),
    });
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

  /**
   * Admits a packet from the host, or refuses it.
   *
   * The host in a friend room is another player, not a server anybody controls,
   * so its log is a claim rather than a fact. Every packet is re-checked against
   * the rules before it moves this peer's state: `verifyFrom` starts at the end
   * of the log we already hold, because everything before that arrived through
   * this same gate. A refusal leaves the session where it was, which makes the
   * caller's hash comparison disagree and pulls a snapshot down — the same path
   * an ordinary desync takes, and the right one, because a peer that cannot
   * agree on the board should stop playing on its own copy of it.
   */
  applyRemote(packet: AppliedPacket): RemoteApplyResult {
    const { session, settings } = this.authorityState;
    if (this.acceptedActions.has(packet.actionId)) {
      return { stateHash: stateHash(session.state), accepted: false, fault: null };
    }
    const firstSeq = packet.events[0]?.seq;
    if (firstSeq === undefined || firstSeq !== session.log.length) {
      return { stateHash: stateHash(session.state), accepted: false, fault: null };
    }
    const nextSession = replaySession(this.def, session.seed, [...session.log, ...packet.events], {
      config: session.config,
      seats: session.seats,
      verifyFrom: session.log.length,
      ...veilOptions(settings, session.deckOrder),
    });
    if (nextSession.fault) {
      return { stateHash: stateHash(session.state), accepted: false, fault: nextSession.fault };
    }
    // Replay reconstructs state/phase from the authoritative events, then keep
    // the packets themselves as the replicated log. In particular, replay's
    // reducer does not manufacture host wall-clock `ts` metadata; dropping it
    // here made guest logs semantically equivalent but not byte-identical.
    this.authorityState = {
      session: { ...nextSession, log: [...session.log, ...packet.events] },
      settings,
    };
    this.acceptedActions.set(packet.actionId, packet.events.at(-1)!.seq);
    return { stateHash: stateHash(nextSession.state), accepted: true, fault: null };
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
    const { min, max } = this.seatsRange;
    if (
      !Number.isInteger(snapshot.settings.seats) ||
      snapshot.settings.seats < min ||
      snapshot.settings.seats > max
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
    // A schema may carry values that are not house-rule *fields* — Blitz's
    // `outMask` is written by the match layer and deliberately absent from the
    // picker. Keying this off `fields` alone rejected every Blitz snapshot the
    // moment that landed, so ask the schema what a complete config looks like.
    // The round-trip check below still rejects a forged or non-canonical value.
    const knownKeys = new Set(Object.keys(this.def.configSchema.defaults()));
    if (Object.keys(value).some((key) => !knownKeys.has(key))) {
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
