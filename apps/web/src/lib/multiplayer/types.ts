import type { AppliedEvent, FxEvent, RuleValues, SeatId } from '@parlour/engine';

export type PeerId = string;
export type ProfileId = string;

export type RoomSettings = {
  gameId: string;
  seats: number;
  config: RuleValues;
};

export type PlayerAction = {
  id: string;
  seat: SeatId;
  move: string;
  payload?: unknown;
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
  stateHash: string;
  settings: RoomSettings;
};

export type PresenceEvent =
  | { kind: 'peer.joined'; peerId: PeerId; seat: SeatId }
  | { kind: 'peer.left'; peerId: PeerId; seat: SeatId; bot: true }
  | { kind: 'seat.reclaimed'; peerId: PeerId; seat: SeatId }
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
  applyRemote(packet: AppliedPacket): string | Promise<string>;
  exportSnapshot(): ReplaySnapshot;
  importSnapshot(snapshot: ReplaySnapshot): void | Promise<void>;
  setSeatBot(seat: SeatId, bot: boolean): void;
}

export interface Transport {
  create(settings: RoomSettings): Promise<RoomHandle>;
  join(code: string): Promise<RoomHandle>;
  send(action: PlayerAction): void;
  sendEmote(emote: Emote): boolean;
  onEvent(cb: (event: AppliedPacket) => void): () => void;
  onPresence(cb: (presence: PresenceEvent) => void): () => void;
  onEmote(cb: (peerId: PeerId, emote: Emote) => void): () => void;
}
