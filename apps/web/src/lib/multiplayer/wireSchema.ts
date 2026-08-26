import type { AppliedEvent, FxEvent, SeatId } from '@parlour/engine';
import { isDealDigest } from './dealSeed';
import { EMOTES } from './emotes';
import { isVeilMessage, veilWireFault, type VeilMessage } from './veil/wire';
import type {
  AppliedPacket,
  Emote,
  MigrationSnapshot,
  PlayerAction,
  PresenceSnapshot,
  PlayerProfile,
  ReplaySnapshot,
  SeatPresence,
} from './types';

const MAX_WIRE_BYTES = 512_000;
const MAX_ID_LENGTH = 128;
const MAX_LABEL_LENGTH = 128;
const MAX_HASH_LENGTH = 256;
const MAX_PEERS = 8;
/**
 * Wire-level seat ceiling for every game — the shared table shell supports up
 * to eight chairs (President's full ring). Per-game capacity lives in
 * lib/rooms/seatRange; this bound only keeps hostile packets sane.
 */
const MAX_SEATS = 8;
const MAX_APPLIED_EVENTS = 64;
const MAX_SNAPSHOT_EVENTS = 4_096;
const MAX_FX_EVENTS = 256;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 4_096;
const MAX_JSON_COLLECTION = 256;
const MAX_JSON_STRING = 16_384;
const MAX_SEQUENCE = 1_000_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_FX_OFFSET = 60_000;
const MAX_CONFIG_NUMBER = 1_000_000;
const MAX_DECK_ORDER = 256;

export type PeerDescriptor = { peerId: string; profile: PlayerProfile };

export type WireMessage =
  | { type: 'hello'; profile: PlayerProfile }
  | {
      type: 'welcome';
      hostId: string;
      hostTerm?: number;
      seat: SeatId;
      peers: PeerDescriptor[];
      snapshot: MigrationSnapshot;
    }
  | { type: 'mesh.peers'; peers: PeerDescriptor[] }
  | { type: 'presence.state'; presence: PresenceSnapshot }
  | { type: 'intent'; action: PlayerAction }
  | { type: 'applied'; packet: AppliedPacket }
  | { type: 'heartbeat'; sentAt: number; hostId?: string; term?: number }
  | { type: 'host.changed'; hostId: string; term?: number; snapshot: MigrationSnapshot }
  /** Host is tearing the lobby down — guests must leave, not elect a replacement. */
  | { type: 'room.closed' }
  | { type: 'sync.request'; expectedSeq: number }
  | { type: 'sync.snapshot'; snapshot: MigrationSnapshot }
  | { type: 'rematch.request' }
  | { type: 'rematch.start'; snapshot: MigrationSnapshot }
  | { type: 'emote'; emote: Emote }
  /**
   * The collaborative deal: a seat's commitment, then the share it committed
   * to. Neither carries a seat number — the receiver attributes them to the
   * sender's own seat, so no peer can mix the shuffle on another's behalf.
   */
  | { type: 'deal.commit'; commit: string }
  | { type: 'deal.reveal'; nonce: string }
  /**
   * Parlour Veil traffic: the shuffle ceremony, private peels and the
   * match-end disclosure. Validated by the veil schema before it reaches any
   * cryptography — see veil/wire.ts.
   */
  | { type: 'veil'; to: string | null; message: VeilMessage };

/** The collaborative-deal messages, as one type for the transport's API. */
export type DealMessage = Extract<WireMessage, { type: 'deal.commit' | 'deal.reveal' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isBoundedString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isBoundedInteger(value: unknown, maximum: number): value is number {
  return isNonNegativeInteger(value) && value <= maximum;
}

function isSeat(value: unknown): value is SeatId {
  return isNonNegativeInteger(value) && value < MAX_SEATS;
}

function isJsonValue(value: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes++;
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return false;
    if (
      current.value === null ||
      typeof current.value === 'boolean' ||
      (typeof current.value === 'number' &&
        Number.isFinite(current.value) &&
        Math.abs(current.value) <= Number.MAX_SAFE_INTEGER)
    ) {
      continue;
    }
    if (typeof current.value === 'string') {
      if (current.value.length > MAX_JSON_STRING) return false;
      continue;
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_JSON_COLLECTION) return false;
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(current.value)) return false;
    const entries = Object.entries(current.value);
    if (entries.length > MAX_JSON_COLLECTION) return false;
    for (const [key, child] of entries) {
      if (key.length > MAX_LABEL_LENGTH) return false;
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}

function isPeerDescriptor(value: unknown): value is PeerDescriptor {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['peerId', 'profile']) &&
    isBoundedString(value.peerId) &&
    isPlayerProfile(value.profile)
  );
}

function isPlayerProfile(value: unknown): value is PlayerProfile {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['profileId', 'name', 'avatarId']) &&
    isBoundedString(value.profileId) &&
    isBoundedString(value.name, 32) &&
    isBoundedString(value.avatarId, MAX_LABEL_LENGTH)
  );
}

function isPeerDescriptors(value: unknown): value is PeerDescriptor[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PEERS &&
    value.every(isPeerDescriptor) &&
    new Set(value.map((peer) => peer.peerId)).size === value.length
  );
}

function isSeatPresence(value: unknown): value is SeatPresence {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['peerId', 'profileId', 'bot']) &&
    isBoundedString(value.peerId) &&
    isBoundedString(value.profileId) &&
    typeof value.bot === 'boolean'
  );
}

function isSeats(value: unknown): value is Array<[SeatId, SeatPresence]> {
  if (!Array.isArray(value) || value.length > MAX_SEATS) return false;
  const seats = new Set<number>();
  for (const entry of value) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !isSeat(entry[0]) ||
      !isSeatPresence(entry[1]) ||
      seats.has(entry[0])
    ) {
      return false;
    }
    seats.add(entry[0]);
  }
  return true;
}

function isPresenceSnapshot(value: unknown, maxSeats: number): value is PresenceSnapshot {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['version', 'seats']) &&
    isBoundedInteger(value.version, MAX_SEQUENCE) &&
    isSeats(value.seats) &&
    value.seats.every(([seat]) => seat < maxSeats)
  );
}

function isPlayerAction(value: unknown): value is PlayerAction {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'seat', 'move'], ['payload', 'reveals', 'recycle']) &&
    isBoundedString(value.id) &&
    isSeat(value.seat) &&
    isBoundedString(value.move, MAX_LABEL_LENGTH) &&
    (!Object.hasOwn(value, 'payload') || isJsonValue(value.payload)) &&
    (!Object.hasOwn(value, 'reveals') || isCardMapping(value.reveals)) &&
    (!Object.hasOwn(value, 'recycle') || isCardRecycle(value.recycle))
  );
}

function isAppliedEvent(value: unknown): value is AppliedEvent {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['seq', 'seat', 'move'],
      ['payload', 'ts', 'atMs', 'automatic', 'injected', 'reveals', 'recycle', 'hash'],
    ) &&
    isBoundedInteger(value.seq, MAX_SEQUENCE) &&
    (value.seat === null || isSeat(value.seat)) &&
    isBoundedString(value.move, MAX_LABEL_LENGTH) &&
    (!Object.hasOwn(value, 'payload') || isJsonValue(value.payload)) &&
    (!Object.hasOwn(value, 'ts') || isBoundedInteger(value.ts, MAX_TIMESTAMP)) &&
    (!Object.hasOwn(value, 'atMs') || isBoundedInteger(value.atMs, MAX_TIMESTAMP)) &&
    (!Object.hasOwn(value, 'automatic') || typeof value.automatic === 'boolean') &&
    (!Object.hasOwn(value, 'injected') || typeof value.injected === 'boolean') &&
    (!Object.hasOwn(value, 'reveals') || isCardMapping(value.reveals)) &&
    (!Object.hasOwn(value, 'recycle') || isCardRecycle(value.recycle)) &&
    (!Object.hasOwn(value, 'hash') || isBoundedString(value.hash, MAX_HASH_LENGTH))
  );
}

/**
 * Veil openings ride on the event as pairs of card ids. There can never be more
 * than a deck's worth in one move, so the bound is the deck, not whatever the
 * sender claims.
 */
function isCardMapping(value: unknown): value is Array<[string, string]> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_DECK_ORDER &&
    value.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        isBoundedString(pair[0], MAX_LABEL_LENGTH) &&
        isBoundedString(pair[1], MAX_LABEL_LENGTH),
    ) &&
    new Set(value.map((pair) => (pair as string[])[0])).size === value.length
  );
}

/** A recycle exposes the two sets but never a card-to-handle pairing. */
function isCardRecycle(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['retire', 'issue']) &&
    isCardList(value.retire) &&
    isCardList(value.issue) &&
    value.retire.length === value.issue.length
  );
}

function isCardList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_DECK_ORDER &&
    value.every((card) => isBoundedString(card, MAX_LABEL_LENGTH)) &&
    new Set(value).size === value.length
  );
}

function isFxEvent(value: unknown): value is FxEvent {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind'], ['payload', 'at']) &&
    isBoundedString(value.kind, MAX_LABEL_LENGTH) &&
    (!Object.hasOwn(value, 'payload') || isJsonValue(value.payload)) &&
    (!Object.hasOwn(value, 'at') || isBoundedInteger(value.at, MAX_FX_OFFSET))
  );
}

function isRoomSettings(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['gameId', 'seats', 'config'], ['security']) ||
    (Object.hasOwn(value, 'security') && value.security !== 'open' && value.security !== 'veil') ||
    !isBoundedString(value.gameId, MAX_LABEL_LENGTH) ||
    !Number.isInteger(value.seats) ||
    (value.seats as number) < 2 ||
    (value.seats as number) > MAX_SEATS ||
    !isRecord(value.config)
  ) {
    return false;
  }
  const entries = Object.entries(value.config);
  return (
    entries.length <= 64 &&
    entries.every(
      ([key, setting]) =>
        key.length > 0 &&
        key.length <= MAX_LABEL_LENGTH &&
        (typeof setting === 'boolean' ||
          (typeof setting === 'number' &&
            Number.isFinite(setting) &&
            Math.abs(setting) <= MAX_CONFIG_NUMBER) ||
          (typeof setting === 'string' && setting.length <= MAX_LABEL_LENGTH)),
    )
  );
}

/** A ceremony deck order: distinct, bounded card ids, one per deck position. */
function isDeckOrder(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_DECK_ORDER &&
    value.every((card) => isBoundedString(card, MAX_LABEL_LENGTH)) &&
    new Set(value as string[]).size === value.length
  );
}

function isReplaySnapshot(value: unknown): value is ReplaySnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['seed', 'log', 'acceptedActions', 'stateHash', 'settings'],
      ['deckOrder'],
    ) ||
    (Object.hasOwn(value, 'deckOrder') && !isDeckOrder(value.deckOrder)) ||
    !isBoundedInteger(value.seed, 0xffff_ffff) ||
    !Array.isArray(value.log) ||
    value.log.length > MAX_SNAPSHOT_EVENTS ||
    !value.log.every((event, index) => isAppliedEvent(event) && event.seq === index) ||
    !Array.isArray(value.acceptedActions) ||
    value.acceptedActions.length > value.log.length ||
    !isBoundedString(value.stateHash, MAX_HASH_LENGTH) ||
    !isRoomSettings(value.settings)
  ) {
    return false;
  }
  const ids = new Set<string>();
  let previousSeq = -1;
  for (const action of value.acceptedActions) {
    if (
      !isRecord(action) ||
      !hasOnlyKeys(action, ['id', 'seq']) ||
      !isBoundedString(action.id) ||
      ids.has(action.id) ||
      !isBoundedInteger(action.seq, MAX_SEQUENCE) ||
      action.seq <= previousSeq ||
      action.seq >= value.log.length
    ) {
      return false;
    }
    ids.add(action.id);
    previousSeq = action.seq;
  }
  return previousSeq === value.log.length - 1;
}

function isMigrationSnapshot(value: unknown): value is MigrationSnapshot {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['replay', 'presence']) &&
    isReplaySnapshot(value.replay) &&
    isPresenceSnapshot(value.presence, value.replay.settings.seats)
  );
}

function isAppliedPacket(value: unknown): value is AppliedPacket {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['actionId', 'events', 'fx', 'stateHash']) &&
    isBoundedString(value.actionId) &&
    Array.isArray(value.events) &&
    value.events.length > 0 &&
    value.events.length <= MAX_APPLIED_EVENTS &&
    value.events.every(
      (event, index, events) =>
        isAppliedEvent(event) && (index === 0 || event.seq === events[index - 1]!.seq + 1),
    ) &&
    Array.isArray(value.fx) &&
    value.fx.length <= MAX_FX_EVENTS &&
    value.fx.every(isFxEvent) &&
    isBoundedString(value.stateHash, MAX_HASH_LENGTH)
  );
}

function isWireMessage(value: unknown): value is WireMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'hello':
      return hasOnlyKeys(value, ['type', 'profile']) && isPlayerProfile(value.profile);
    case 'welcome': {
      if (
        !hasOnlyKeys(value, ['type', 'hostId', 'seat', 'peers', 'snapshot'], ['hostTerm']) ||
        !isBoundedString(value.hostId) ||
        (value.hostTerm !== undefined && !isBoundedInteger(value.hostTerm, MAX_SEQUENCE)) ||
        !isSeat(value.seat) ||
        !isPeerDescriptors(value.peers) ||
        !isMigrationSnapshot(value.snapshot)
      ) {
        return false;
      }
      return value.seat < value.snapshot.replay.settings.seats;
    }
    case 'mesh.peers':
      return hasOnlyKeys(value, ['type', 'peers']) && isPeerDescriptors(value.peers);
    case 'presence.state':
      return (
        hasOnlyKeys(value, ['type', 'presence']) && isPresenceSnapshot(value.presence, MAX_SEATS)
      );
    case 'intent':
      return hasOnlyKeys(value, ['type', 'action']) && isPlayerAction(value.action);
    case 'applied':
      return hasOnlyKeys(value, ['type', 'packet']) && isAppliedPacket(value.packet);
    case 'heartbeat':
      return (
        hasOnlyKeys(value, ['type', 'sentAt'], ['hostId', 'term']) &&
        isBoundedInteger(value.sentAt, MAX_TIMESTAMP) &&
        ((value.hostId === undefined && value.term === undefined) ||
          (isBoundedString(value.hostId) && isBoundedInteger(value.term, MAX_SEQUENCE)))
      );
    case 'host.changed':
      return (
        hasOnlyKeys(value, ['type', 'hostId', 'snapshot'], ['term']) &&
        isBoundedString(value.hostId) &&
        (value.term === undefined || isBoundedInteger(value.term, MAX_SEQUENCE)) &&
        isMigrationSnapshot(value.snapshot)
      );
    case 'room.closed':
      return hasOnlyKeys(value, ['type']);
    case 'sync.request':
      return (
        hasOnlyKeys(value, ['type', 'expectedSeq']) &&
        isBoundedInteger(value.expectedSeq, MAX_SEQUENCE)
      );
    case 'sync.snapshot':
      return hasOnlyKeys(value, ['type', 'snapshot']) && isMigrationSnapshot(value.snapshot);
    case 'rematch.request':
      return hasOnlyKeys(value, ['type']);
    case 'rematch.start':
      return hasOnlyKeys(value, ['type', 'snapshot']) && isMigrationSnapshot(value.snapshot);
    case 'emote':
      return (
        hasOnlyKeys(value, ['type', 'emote']) &&
        typeof value.emote === 'string' &&
        EMOTES.includes(value.emote as Emote)
      );
    case 'deal.commit':
      return hasOnlyKeys(value, ['type', 'commit']) && isDealDigest(value.commit);
    case 'deal.reveal':
      return hasOnlyKeys(value, ['type', 'nonce']) && isDealDigest(value.nonce);
    case 'veil':
      return (
        (hasOnlyKeys(value, ['type', 'to', 'message']) ||
          hasOnlyKeys(value, ['type', 'message'])) &&
        (value.to === undefined || value.to === null || isBoundedString(value.to)) &&
        isVeilMessage(value.message)
      );
    default:
      return false;
  }
}

export function parseWire(data: string): WireMessage | null {
  if (data.length > MAX_WIRE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(data);
    return isWireMessage(value) ? value : null;
  } catch {
    return null;
  }
}

function rejectionMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown receiver error';
}

/**
 * Names the packet that failed, when it named itself.
 *
 * A bare "Malformed multiplayer packet" is unactionable for the player seeing
 * it and nearly as unhelpful in a bug report: every message on the mesh fails
 * the same way. The `type` is the one field worth quoting, and it is untrusted
 * input on its way to the screen, so it is bounded and stripped to the shape a
 * real message type has.
 */
function wireText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data as ArrayBufferView);
  }
  return null;
}

function describeMalformed(data: string): string {
  try {
    const value: unknown = JSON.parse(data);
    if (isRecord(value) && value.type === 'veil') {
      return `Malformed multiplayer packet (${veilWireFault(value)})`;
    }
    if (isRecord(value) && typeof value.type === 'string') {
      const type = value.type.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 32);
      if (type) return `Malformed multiplayer packet (${type})`;
    }
  } catch {
    // Not JSON at all — nothing to name.
  }
  return 'Malformed multiplayer packet';
}

export function dispatchWireData(
  data: unknown,
  receive: (message: WireMessage) => void | Promise<void>,
  report: (message: string) => void,
): void {
  const safeReport = (message: string) => {
    try {
      report(message);
    } catch {
      // A consumer error must not turn hostile input into an uncaught channel callback.
    }
  };
  const text = wireText(data);
  if (text === null) {
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      void data.text().then(
        (blobText) => dispatchWireData(blobText, receive, report),
        () => safeReport('Malformed multiplayer packet'),
      );
      return;
    }
    safeReport('Malformed multiplayer packet');
    return;
  }
  const message = parseWire(text);
  if (!message) {
    safeReport(describeMalformed(text));
    return;
  }
  try {
    void Promise.resolve(receive(message)).catch((error: unknown) => {
      safeReport(`Multiplayer packet rejected: ${rejectionMessage(error)}`);
    });
  } catch (error) {
    safeReport(`Multiplayer packet rejected: ${rejectionMessage(error)}`);
  }
}
