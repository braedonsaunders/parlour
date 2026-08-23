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
    const outcome = sessionApply(this.def, this.session, action.seat, action.move, action.payload);
    if (outcome.rejected) throw new Error(outcome.rejected.message);
    const timestamp = this.now();
    const events = outcome.events.map((event) => ({ ...event, ts: timestamp }));
    this.session = { ...outcome.session, log: [...this.session.log, ...events] };
    return {
      actionId: action.id,
      events,
      fx: outcome.fx,
      stateHash: stateHash(this.session.state),
    };
  }

  applyRemote(packet: AppliedPacket): string {
    const firstSeq = packet.events[0]?.seq;
    if (firstSeq === undefined || firstSeq !== this.session.log.length)
      return stateHash(this.session.state);
    this.session = replaySession(
      this.def,
      this.session.seed,
      [...this.session.log, ...packet.events],
      {
        config: this.session.config,
        seats: this.session.seats,
      },
    );
    return stateHash(this.session.state);
  }

  exportSnapshot(): ReplaySnapshot {
    return {
      seed: this.session.seed,
      log: [...this.session.log],
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
    this.session = replayed;
  }

  setSeatBot(seat: number, bot: boolean): void {
    this.onSeatBot?.(seat, bot);
  }

  getSession(): GameSession<S, C> {
    return this.session;
  }
}
