import type {
  PlayerAction,
  PlayerProfile,
  PresenceSnapshot,
  ProfileId,
  SeatPresence,
} from './types';

export const HEARTBEAT_INTERVAL_MS = 1_000;
export const HEARTBEAT_TIMEOUT_MS = 3_500;

/**
 * How long a chair is held for a peer that said it was going away.
 *
 * Three and a half seconds of silence is the right test for a phone that has
 * dropped off the network — and completely the wrong one for a player who
 * flicked to their messages, because a backgrounded tab is frozen by the
 * operating system and cannot send anything at all. Long enough to answer a
 * text and come back; short enough that a chair somebody has truly abandoned
 * still frees up while the others are deciding what to play.
 */
export const AWAY_GRACE_MS = 90_000;

/**
 * A gap between heartbeat ticks that can only mean this device stopped running.
 *
 * Well clear of anything load can produce: a contended machine is late by
 * fractions of a second, a frozen page by however long its player was away.
 * Reading a busy device as a sleeping one would delay noticing a host that
 * genuinely died, so the two must not be confusable.
 */
export const STALLED_CLOCK_MS = 10_000;

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
  /** Peers that announced they were backgrounding, and until when to hold them. */
  private readonly awayUntil = new Map<string, number>();
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

  /**
   * Accepts or refuses another peer's claim to be the host.
   *
   * The deterministic-candidate rule keeps two peers from electing themselves
   * at once, but on its own it is a rule about *who* may take over, not about
   * *when*. The lexicographically smallest peer satisfies it permanently, so it
   * could raise the term and seize a live host's authority at any moment — no
   * fork, no disagreement, just a peer deciding it would rather be in charge.
   *
   * So a claim that raises the term also has to survive this peer's own view:
   * refuse it while we can still hear the host we already have. If the host
   * really is gone, every peer's `lastSeen` for it goes stale within the
   * heartbeat timeout and the claim goes through on the next attempt.
   *
   * `now` is undefined only for callers with no clock in hand (a trusted
   * welcome, which skips these checks anyway, and tests that assert the
   * candidate rule in isolation).
   */
  considerHostClaim(
    hostId: string,
    term: number,
    trustedWelcome = false,
    now?: number,
    timeoutMs = HEARTBEAT_TIMEOUT_MS,
  ): boolean {
    if (!hostId || !Number.isSafeInteger(term) || term < 0) return false;
    if (!trustedWelcome) {
      if (term > this.hostTerm + 1) return false;
      const deterministicCandidate = [this.localPeerId, hostId, ...this.lastSeen.keys()].sort()[0];
      if (hostId !== deterministicCandidate) return false;
      if (term > this.hostTerm && now !== undefined && hostId !== this.hostId) {
        const hostSeenAt = this.lastSeen.get(this.hostId);
        if (
          this.hostId === this.localPeerId ||
          (hostSeenAt !== undefined && now - hostSeenAt <= timeoutMs)
        ) {
          return false;
        }
      }
    }
    const wins = term > this.hostTerm || (term === this.hostTerm && hostId < this.hostId);
    if (!wins) return false;
    this.hostId = hostId;
    this.hostTerm = term;
    return true;
  }

  seePeer(peerId: string, now: number): void {
    this.lastSeen.set(peerId, now);
    this.awayUntil.delete(peerId);
  }

  /**
   * Holds this peer's chair while its page is frozen.
   *
   * A backgrounded tab cannot heartbeat — the operating system has stopped
   * running its timers — so the last thing it does before going quiet is say
   * so. Until the grace runs out, silence from that peer proves nothing and is
   * not counted against it.
   */
  holdAway(peerId: string, now: number, graceMs = AWAY_GRACE_MS): void {
    this.awayUntil.set(peerId, now + graceMs);
  }

  /** True while this peer has told us it is backgrounded rather than gone. */
  isAway(peerId: string, now: number): boolean {
    return now <= (this.awayUntil.get(peerId) ?? -Infinity);
  }

  /**
   * Starts every peer's silence over from now.
   *
   * For when *this* device is the one that stopped keeping time: a frozen tab
   * resumes with a clock that has jumped minutes, and every peer it can still
   * hear perfectly well looks like it has been silent for the whole gap. Judged
   * on that, a player coming back from their messages would expire the entire
   * table on the first tick — closing the lobby they were trying to return to.
   * Nobody was absent; the listener was.
   */
  forgiveSilence(now: number): void {
    for (const peerId of this.lastSeen.keys()) this.lastSeen.set(peerId, now);
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

  /** Seats a house bot in the lobby. The chair stays taken until the host removes it. */
  assignBotSeat(seat: number): SeatPresence {
    const occupant = houseBotOccupant(seat);
    if (
      this.seats.has(seat) ||
      [...this.seats.values()].some(
        (taken) => taken.peerId === occupant.peerId || taken.profileId === occupant.profileId,
      )
    ) {
      throw new Error('seat assignment conflicts with current presence');
    }
    this.seats.set(seat, occupant);
    this.presenceVersion++;
    return occupant;
  }

  /**
   * Gives a returning player their own chair back.
   *
   * Keyed on the profile, not on the peer: a phone that drops its connection
   * and dials again is the same person behind a brand-new peer id, which is
   * exactly the case this exists to serve.
   *
   * It used to also require the seat to be marked `bot` — that is, to wait for
   * the heartbeat to time the old peer out first. Anyone who reconnected faster
   * than that timeout found their seat still warm, still counted as occupied,
   * and no chair free: the host refused them with "Room is full" and their own
   * screen said the host had closed the lobby. Coming back quickly is the good
   * case, and it was the one the room handled worst.
   *
   * A profile match is enough. Two peers claiming one profile is one player on
   * two devices, and the newest connection is the one they are looking at.
   */
  reclaimSeat(peerId: string, profileId: ProfileId): number | null {
    for (const [seat, occupant] of this.seats) {
      if (occupant.profileId === profileId) {
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
    /**
     * Lobby: drop the chair so a friend can sit again.
     * Match: keep the chair and hand it to a bot.
     */
    releaseExpired = false,
  ): { changed: boolean; hostId: string; term: number; resend: PlayerAction[] } {
    const expired = new Set<string>();
    for (const [peerId, seenAt] of this.lastSeen) {
      if (peerId === this.localPeerId) continue;
      // A peer that said it was going away is not missing, it is minimised.
      if (this.isAway(peerId, now)) continue;
      if (now - seenAt > timeoutMs) {
        expired.add(peerId);
        this.lastSeen.delete(peerId);
        this.awayUntil.delete(peerId);
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
      for (const [seat, occupant] of [...this.seats]) {
        if (expired.has(occupant.peerId) && !occupant.bot) {
          if (releaseExpired) this.seats.delete(seat);
          else this.seats.set(seat, { ...occupant, bot: true });
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

export function houseBotPeerId(seat: number): string {
  return `bot:${seat}`;
}

export function houseBotOccupant(seat: number): SeatPresence {
  const peerId = houseBotPeerId(seat);
  return { peerId, profileId: peerId, bot: true };
}

export function houseBotProfile(seat: number): PlayerProfile {
  return {
    profileId: houseBotPeerId(seat),
    name: `Bot ${seat + 1}`,
    avatarId: 'cobalt',
  };
}
