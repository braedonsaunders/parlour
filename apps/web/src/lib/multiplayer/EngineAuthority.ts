import {
  replaySession,
  sessionApply,
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
  private readonly def: GameDef<S, C>;
  private readonly now: () => number;
  private readonly onSeatBot?: (seat: number, bot: boolean) => void;

  constructor(options: EngineAuthorityOptions<S, C>) {
    this.def = options.def;
    this.authorityState = { session: options.session, settings: options.settings };
    this.now = options.now ?? (() => Date.now());
    this.onSeatBot = options.onSeatBot;
  }

  apply(action: PlayerAction): AppliedPacket {
    const { session, settings } = this.authorityState;
    const outcome = sessionApply(this.def, session, action.seat, action.move, action.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    const timestamp = this.now();
    const events = outcome.events.map((event) => ({ ...event, ts: timestamp }));
    const nextSession = { ...outcome.session, log: [...session.log, ...events] };
    this.authorityState = { session: nextSession, settings };
    return {
      actionId: action.id,
      events,
      fx: outcome.fx,
      stateHash: stateHash(nextSession.state),
    };
  }

  applyRemote(packet: AppliedPacket): string {
    const { session, settings } = this.authorityState;
    const firstSeq = packet.events[0]?.seq;
    if (firstSeq === undefined || firstSeq !== session.log.length) return stateHash(session.state);
    const nextSession = replaySession(this.def, session.seed, [...session.log, ...packet.events], {
      config: session.config,
      seats: session.seats,
    });
    this.authorityState = { session: nextSession, settings };
    return stateHash(nextSession.state);
  }

  exportSnapshot(): ReplaySnapshot {
    const { session, settings } = this.authorityState;
    return {
      seed: session.seed,
      log: [...session.log],
      stateHash: stateHash(session.state),
      settings: { ...settings, config: { ...settings.config } },
    };
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
    const config = this.resolveSnapshotConfig(snapshot.settings.config);
    const replayed = replaySession(this.def, snapshot.seed, snapshot.log, {
      config,
      seats: snapshot.settings.seats,
    });
    if (stateHash(replayed.state) !== snapshot.stateHash) throw new Error('snapshot hash mismatch');
    this.authorityState = {
      session: replayed,
      settings: { ...snapshot.settings, config },
    };
  }

  setSeatBot(seat: number, bot: boolean): void {
    this.onSeatBot?.(seat, bot);
  }

  getSession(): GameSession<S, C> {
    return this.authorityState.session;
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
