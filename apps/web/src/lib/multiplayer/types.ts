import type { AppliedEvent, CardRecycle, FxEvent, RuleValues, SeatId } from '@parlour/engine';

export type PeerId = string;
export type ProfileId = string;

export type PlayerProfile = {
  profileId: ProfileId;
  name: string;
  avatarId: string;
};

/**
 * `open` is the fast default: every peer replays the whole game state, so a
 * modified client could read any hand. `veil` runs the Parlour Veil ceremony
 * (see lib/multiplayer/veil) so hands stay private from every peer including
 * the host, at the cost of a shuffle ceremony and a real disconnect trade-off.
 */
export type RoomSecurity = 'open' | 'veil';

export type RoomSettings = {
  gameId: string;
  seats: number;
  config: RuleValues;
  /** absent means `open`, so old room announcements keep working */
  security?: RoomSecurity;
};

export type PlayerAction = {
  id: string;
  seat: SeatId;
  move: string;
  payload?: unknown;
  /**
   * Veil openings the move makes public — `[handle, card]` pairs the acting
   * client proved out of the shuffle ceremony. Absent in open rooms; the engine
   * rejects them there rather than treating them as a free card swap.
   */
  reveals?: readonly (readonly [string, string])[];
  /** A public spent pile exchanged for the handles from a fresh Veil epoch. */
  recycle?: CardRecycle;
};

export type AppliedPacket = {
  actionId: string;
  events: AppliedEvent[];
  fx: FxEvent[];
  stateHash: string;
};

export type ReplaySnapshot = {
  seed: number;
  log: AppliedEvent[];
  acceptedActions: Array<{ id: string; seq: number }>;
  stateHash: string;
  settings: RoomSettings;
  /**
   * The ceremony deck order a veiled round was dealt from. A veiled snapshot is
   * unreplayable without it, and it leaks nothing: every entry is an opaque
   * handle apart from the setup cards the room already opened in public.
   */
  deckOrder?: string[];
};

export type SnapshotNotification = {
  kind: 'snapshot';
  /**
   * `divergence` — the peer's replay disagreed and it re-synced.
   * `opening` — the host published the round's starting position, which a
   * veiled room does once its shuffle ceremony closes.
   */
  reason: 'divergence' | 'opening';
  snapshot: ReplaySnapshot;
};

export type SeatPresence = {
  peerId: PeerId;
  profileId: ProfileId;
  bot: boolean;
};

export type PresenceSnapshot = {
  version: number;
  seats: Array<[SeatId, SeatPresence]>;
};

export type MigrationSnapshot = {
  replay: ReplaySnapshot;
  presence: PresenceSnapshot;
};

export type RemoteApplyResult = {
  stateHash: string;
  accepted: boolean;
};

export type PresenceEvent =
  | { kind: 'peer.joined'; peerId: PeerId; seat: SeatId; profile: PlayerProfile }
  | { kind: 'peer.left'; peerId: PeerId; seat: SeatId; bot: true }
  | { kind: 'seat.reclaimed'; peerId: PeerId; seat: SeatId; profile: PlayerProfile }
  | { kind: 'host.changed'; hostId: PeerId }
  | { kind: 'connection'; state: 'connecting' | 'connected' | 'reconnecting' | 'closed' }
  | { kind: 'error'; message: string };

export type Emote = 'hello' | 'nice' | 'oops' | 'wow' | 'hurry' | 'gg';

export type RoomHandle = {
  code: string;
  peerId: PeerId;
  hostId: PeerId;
  shareUrl: string;
  close(): void;
};

export interface AuthorityAdapter {
  apply(action: PlayerAction): AppliedPacket | Promise<AppliedPacket>;
  inject?(
    actionId: string,
    move: string,
    payload?: unknown,
    /** Openings a mid-hand public turn produced, substituted before the move runs. */
    reveals?: readonly (readonly [string, string])[],
  ): AppliedPacket | Promise<AppliedPacket>;
  applyRemote(packet: AppliedPacket): RemoteApplyResult | Promise<RemoteApplyResult>;
  exportSnapshot(): ReplaySnapshot;
  importSnapshot(snapshot: ReplaySnapshot): void | Promise<void>;
  setSeatBot(seat: SeatId, bot: boolean): void;
}

export interface Transport {
  create(settings: RoomSettings): Promise<RoomHandle>;
  join(code: string): Promise<RoomHandle>;
  send(action: PlayerAction): void;
  /** Host-only authoritative system event, such as a deterministic clock tick. */
  inject(move: string, payload?: unknown, reveals?: readonly (readonly [string, string])[]): void;
  sendEmote(emote: Emote): boolean;
  onEvent(cb: (event: AppliedPacket) => void): () => void;
  onSnapshot(cb: (notification: SnapshotNotification) => void): () => void;
  onPresence(cb: (presence: PresenceEvent) => void): () => void;
  onEmote(cb: (peerId: PeerId, emote: Emote) => void): () => void;
}
