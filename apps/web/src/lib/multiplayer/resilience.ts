import type { PlayerAction, PresenceSnapshot, ProfileId, SeatPresence } from './types';

export const HEARTBEAT_INTERVAL_MS = 1_000;
export const HEARTBEAT_TIMEOUT_MS = 3_500;

export function validatePresenceSnapshot(snapshot: unknown, maxSeats: number): PresenceSnapshot {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Number.isInteger(maxSeats) ||
    maxSeats < 2 ||
    // The shared shell seats up to eight (President's full ring); per-game
    // capacity lives in lib/rooms/seatRange.
    maxSeats > 8
  ) {
    throw new Error('invalid presence snapshot');
  }
  const candidate = snapshot as Record<string, unknown>;
  if (
    !Number.isSafeInteger(candidate.version) ||
    (candidate.version as number) < 0 ||
    !Array.isArray(candidate.seats)
  ) {
    throw new Error('invalid presence snapshot');
  }
  const seats: PresenceSnapshot['seats'] = [];
  const seatIds = new Set<number>();
  const peerIds = new Set<string>();
  const profileIds = new Set<string>();
  for (const entry of candidate.seats) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('invalid presence snapshot');
    const [seat, rawOccupant] = entry as [unknown, unknown];
    if (!rawOccupant || typeof rawOccupant !== 'object') {
      throw new Error('invalid presence snapshot');
    }
    const occupant = rawOccupant as Record<string, unknown>;
    if (
      !Number.isInteger(seat) ||
      (seat as number) < 0 ||
      (seat as number) >= maxSeats ||
      seatIds.has(seat as number) ||
      typeof occupant.peerId !== 'string' ||
      occupant.peerId.length === 0 ||
      occupant.peerId.length > 128 ||
      peerIds.has(occupant.peerId) ||
      typeof occupant.profileId !== 'string' ||
      occupant.profileId.length === 0 ||
      occupant.profileId.length > 128 ||
      profileIds.has(occupant.profileId) ||
      typeof occupant.bot !== 'boolean'
    ) {
      throw new Error('invalid presence snapshot');
    }
    seatIds.add(seat as number);
    peerIds.add(occupant.peerId);
    profileIds.add(occupant.profileId);
    seats.push([
      seat as number,
      { peerId: occupant.peerId, profileId: occupant.profileId, bot: occupant.bot },
    ]);
  }
  seats.sort(([left], [right]) => left - right);
  return { version: candidate.version as number, seats };
}

export class MultiplayerState {
  readonly seats = new Map<number, SeatPresence>();
  private readonly lastSeen = new Map<string, number>();
  private readonly pending = new Map<string, PlayerAction>();
  private presenceVersion = 0;
  private hostTerm = 0;

  constructor(
    readonly localPeerId: string,
    public hostId: string,
  ) {}

  get electionTerm(): number {
    return this.hostTerm;
  }

  considerHostClaim(hostId: string, term: number, trustedWelcome = false): boolean {
    if (!hostId || !Number.isSafeInteger(term) || term < 0) return false;
    if (!trustedWelcome) {
      if (term > this.hostTerm + 1) return false;
      const deterministicCandidate = [this.localPeerId, hostId, ...this.lastSeen.keys()].sort()[0];
      if (hostId !== deterministicCandidate) return false;
    }
    const wins = term > this.hostTerm || (term === this.hostTerm && hostId < this.hostId);
    if (!wins) return false;
    this.hostId = hostId;
    this.hostTerm = term;
    return true;
  }

  seePeer(peerId: string, now: number): void {
    this.lastSeen.set(peerId, now);
  }

  assignSeat(seat: number, peerId: string, profileId: ProfileId): void {
    if (
      this.seats.has(seat) ||
      [...this.seats.values()].some(
        (occupant) => occupant.peerId === peerId || occupant.profileId === profileId,
      )
    ) {
      throw new Error('seat assignment conflicts with current presence');
    }
    this.seats.set(seat, { peerId, profileId, bot: false });
    this.presenceVersion++;
  }

  reclaimSeat(peerId: string, profileId: ProfileId): number | null {
    for (const [seat, occupant] of this.seats) {
      if (occupant.profileId === profileId && occupant.bot) {
        this.seats.set(seat, { peerId, profileId, bot: false });
        this.presenceVersion++;
        return seat;
      }
    }
    return null;
  }

  exportPresence(): PresenceSnapshot {
    return {
      version: this.presenceVersion,
      seats: [...this.seats].sort(([left], [right]) => left - right),
    };
  }

  applyPresence(snapshot: PresenceSnapshot, maxSeats: number, authoritative = false): boolean {
    const validated = validatePresenceSnapshot(snapshot, maxSeats);
    if (!authoritative && validated.version < this.presenceVersion) return false;
    if (validated.version === this.presenceVersion) {
      if (
        !authoritative &&
        JSON.stringify(validated.seats) !== JSON.stringify(this.exportPresence().seats)
      ) {
        throw new Error('conflicting presence snapshot');
      }
      if (JSON.stringify(validated.seats) === JSON.stringify(this.exportPresence().seats)) {
        return false;
      }
    }
    this.seats.clear();
    for (const [seat, occupant] of validated.seats) this.seats.set(seat, occupant);
    this.presenceVersion = validated.version;
    return true;
  }

  trackPending(action: PlayerAction): void {
    this.pending.set(action.id, action);
  }

  confirmAction(actionId: string): void {
    this.pending.delete(actionId);
  }

  checkHash(expectedSeq: number, localHash: string, remoteHash: string) {
    return localHash === remoteHash ? null : { expectedSeq };
  }

  expireAndElect(
    now: number,
    timeoutMs = HEARTBEAT_TIMEOUT_MS,
  ): { changed: boolean; hostId: string; term: number; resend: PlayerAction[] } {
    const expired = new Set<string>();
    for (const [peerId, seenAt] of this.lastSeen) {
      if (peerId !== this.localPeerId && now - seenAt > timeoutMs) {
        expired.add(peerId);
        this.lastSeen.delete(peerId);
      }
    }
    const previousHostId = this.hostId;
    const hostExpired = expired.has(previousHostId);
    if (hostExpired) {
      const candidates = [this.localPeerId, ...this.lastSeen.keys()].filter(
        (peerId) => !expired.has(peerId),
      );
      this.hostId = candidates.sort()[0] ?? this.localPeerId;
      this.hostTerm++;
    }

    let presenceChanged = false;
    const ownsPresence = previousHostId === this.localPeerId || this.hostId === this.localPeerId;
    if (ownsPresence) {
      for (const [seat, occupant] of this.seats) {
        if (expired.has(occupant.peerId) && !occupant.bot) {
          this.seats.set(seat, { ...occupant, bot: true });
          presenceChanged = true;
        }
      }
    }
    if (presenceChanged) this.presenceVersion++;

    return {
      changed: hostExpired,
      hostId: this.hostId,
      term: this.hostTerm,
      resend: hostExpired ? [...this.pending.values()] : [],
    };
  }
}
