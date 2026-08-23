import type { PlayerAction, ProfileId } from './types';

export const HEARTBEAT_INTERVAL_MS = 1_000;
export const HEARTBEAT_TIMEOUT_MS = 3_500;
export const ACTION_CACHE_LIMIT = 2_048;

export type SeatPresence = {
  peerId: string;
  profileId: ProfileId;
  bot: boolean;
};

export class MultiplayerState {
  readonly seats = new Map<number, SeatPresence>();
  private readonly lastSeen = new Map<string, number>();
  private readonly pending = new Map<string, PlayerAction>();
  private readonly seenActions = new Set<string>();

  constructor(
    readonly localPeerId: string,
    public hostId: string,
  ) {}

  get seenActionCount(): number {
    return this.seenActions.size;
  }

  seePeer(peerId: string, now: number): void {
    this.lastSeen.set(peerId, now);
  }

  assignSeat(seat: number, peerId: string, profileId: ProfileId): void {
    this.seats.set(seat, { peerId, profileId, bot: false });
  }

  reclaimSeat(peerId: string, profileId: ProfileId): number | null {
    for (const [seat, occupant] of this.seats) {
      if (occupant.profileId === profileId && occupant.bot) {
        this.seats.set(seat, { peerId, profileId, bot: false });
        return seat;
      }
    }
    return null;
  }

  trackPending(action: PlayerAction): void {
    this.pending.set(action.id, action);
  }

  confirmAction(actionId: string): void {
    this.pending.delete(actionId);
  }

  acceptAction(actionId: string): boolean {
    if (this.seenActions.has(actionId)) return false;
    this.seenActions.add(actionId);
    if (this.seenActions.size > ACTION_CACHE_LIMIT) {
      const oldest = this.seenActions.values().next().value as string | undefined;
      if (oldest) this.seenActions.delete(oldest);
    }
    return true;
  }

  checkHash(expectedSeq: number, localHash: string, remoteHash: string) {
    return localHash === remoteHash ? null : { expectedSeq };
  }

  expireAndElect(now: number): { changed: boolean; hostId: string; resend: PlayerAction[] } {
    const expired = new Set<string>();
    for (const [peerId, seenAt] of this.lastSeen) {
      if (peerId !== this.localPeerId && now - seenAt > HEARTBEAT_TIMEOUT_MS) {
        expired.add(peerId);
        this.lastSeen.delete(peerId);
      }
    }
    for (const [seat, occupant] of this.seats) {
      if (expired.has(occupant.peerId)) this.seats.set(seat, { ...occupant, bot: true });
    }

    if (!expired.has(this.hostId)) return { changed: false, hostId: this.hostId, resend: [] };
    const candidates = [this.localPeerId, ...this.lastSeen.keys()].filter(
      (peerId) => !expired.has(peerId),
    );
    this.hostId = candidates.sort()[0] ?? this.localPeerId;
    return { changed: true, hostId: this.hostId, resend: [...this.pending.values()] };
  }
}
