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

export class EngineAuthority<S, C extends RuleValues> implements AuthorityAdapter {
  private session: GameSession<S, C>;
  private acceptedActions = new Map<string, number>();
  private readonly def: GameDef<S, C>;
  private readonly settings: RoomSettings;
  private readonly now: () => number;
  private readonly onSeatBot?: (seat: number, bot: boolean) => void;

  constructor(options: EngineAuthorityOptions<S, C>) {
    this.def = options.def;
    this.session = options.session;
    this.settings = options.settings;
    this.now = options.now ?? (() => Date.now());
    this.onSeatBot = options.onSeatBot;
  }

  apply(action: PlayerAction): AppliedPacket {
    if (this.acceptedActions.has(action.id)) throw new DuplicateActionError(action.id);
    const outcome = sessionApply(this.def, this.session, action.seat, action.move, action.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    const timestamp = this.now();
    const events = outcome.events.map((event) => ({ ...event, ts: timestamp }));
    this.session = { ...outcome.session, log: [...this.session.log, ...events] };
    const lastSeq = events.at(-1)?.seq;
    if (lastSeq === undefined) throw new Error('accepted action produced no replay event');
    this.acceptedActions.set(action.id, lastSeq);
    return {
      actionId: action.id,
      events,
      fx: outcome.fx,
      stateHash: stateHash(this.session.state),
    };
  }

  applyRemote(packet: AppliedPacket): { stateHash: string; accepted: boolean } {
    if (this.acceptedActions.has(packet.actionId)) {
      return { stateHash: stateHash(this.session.state), accepted: false };
    }
    const firstSeq = packet.events[0]?.seq;
    if (firstSeq === undefined || firstSeq !== this.session.log.length)
      return { stateHash: stateHash(this.session.state), accepted: false };
    this.session = replaySession(
      this.def,
      this.session.seed,
      [...this.session.log, ...packet.events],
      {
        config: this.session.config,
        seats: this.session.seats,
      },
    );
    this.acceptedActions.set(packet.actionId, packet.events.at(-1)!.seq);
    return { stateHash: stateHash(this.session.state), accepted: true };
  }

  exportSnapshot(): ReplaySnapshot {
    return {
      seed: this.session.seed,
      log: [...this.session.log],
      acceptedActions: [...this.acceptedActions].map(([id, seq]) => ({ id, seq })),
      stateHash: stateHash(this.session.state),
      settings: this.settings,
    };
  }

  importSnapshot(snapshot: ReplaySnapshot): void {
    if (snapshot.settings.gameId !== this.settings.gameId)
      throw new Error('snapshot game mismatch');
    const replayed = replaySession(this.def, snapshot.seed, snapshot.log, {
      config: this.session.config,
      seats: snapshot.settings.seats,
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
    if (previousSeq !== snapshot.log.length - 1)
      throw new Error('accepted action history does not cover replay log');
    this.session = replayed;
    this.acceptedActions = acceptedActions;
  }

  setSeatBot(seat: number, bot: boolean): void {
    this.onSeatBot?.(seat, bot);
  }

  getSession(): GameSession<S, C> {
    return this.session;
  }
}

export class DuplicateActionError extends Error {
  constructor(actionId: string) {
    super(`duplicate action: ${actionId}`);
    this.name = 'DuplicateActionError';
  }
}
