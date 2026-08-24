import { describe, expect, it, vi } from 'vitest';

// A real 52-card ceremony is thousands of 2048-bit modular exponentiations.
// That is the honest cost of Veil, so these tests get room to pay it rather
// than pretending the shuffle is free.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import {
  createSession,
  replaySession,
  sessionApply,
  stateHash,
  type CardId,
} from '@parlour/engine';
import { blitzConfigSchema, createBlitzDef, type BlitzState } from '@parlour/game-blitz';
import { VeilSession } from './session';
import type { VeilLayerEntry, VeilShare } from './ceremony';
import { auditSummary, countsAsRanked } from './audit';
import { recoveryPolicyFor } from './recovery';

const def = createBlitzDef();
const CONFIG = blitzConfigSchema.defaults();

/**
 * A whole room in one process. Each `VeilSession` only ever touches its own
 * secrets, so anything these seats can do together is something real peers can
 * do over DataChannels.
 */
class Room {
  readonly seats: VeilSession[];

  constructor(
    readonly seatCount: number,
    readonly seed = 4242,
  ) {
    this.seats = Array.from(
      { length: seatCount },
      (_, seat) =>
        new VeilSession({
          roomCode: 'ABCD',
          seed,
          seat,
          seats: seatCount,
          gameId: def.id,
          config: CONFIG,
        }),
    );
  }

  async openRound(): Promise<void> {
    const keys = await Promise.all(this.seats.map((session) => session.start()));
    const deck = def.veil!.deck(CONFIG).cardIds;
    const header = await this.seats[0]!.openRound(keys, deck);
    for (const session of this.seats.slice(1)) {
      expect(await session.adoptRound(header)).toBeNull();
    }
  }

  /** Every seat lays a layer in turn; every other seat checks it. */
  async runCeremony(epoch = 0): Promise<VeilLayerEntry[]> {
    const laid: VeilLayerEntry[] = [];
    for (let seat = 0; seat < this.seatCount; seat++) {
      const entry = await this.seats[seat]!.layLayer(epoch);
      expect(entry, `seat ${seat} should be able to lay layer ${seat}`).not.toBeNull();
      laid.push(entry as VeilLayerEntry);
      for (let other = 0; other < this.seatCount; other++) {
        if (other === seat) continue;
        expect(this.seats[other]!.acceptLayer(entry as VeilLayerEntry)).toBeNull();
      }
    }
    return laid;
  }

  /**
   * Peels one deck position for `recipient`. Every other seat contributes its
   * share first; the recipient applies the last layer itself, so no other seat
   * ever holds the plaintext.
   */
  openTo(recipient: number, position: number, epoch = 0): CardId {
    const order = [...this.seats.keys()].filter((seat) => seat !== recipient).concat(recipient);
    let locked = this.seats[recipient]!.lockedAt(epoch, position) as string;
    const shares: VeilShare[] = [];
    for (const seat of order) {
      const share = this.seats[seat]!.share(epoch, position, locked) as VeilShare;
      shares.push(share);
      locked = share.value;
    }
    const result = this.seats[recipient]!.open(epoch, position, shares, 'private');
    if ('code' in result) throw new Error(`${result.code}: ${result.message}`);
    return result.card;
  }

  /** Same peel, but every seat records the face — a card the table turns over. */
  openPublicly(position: number, epoch = 0): CardId {
    let locked = this.seats[0]!.lockedAt(epoch, position) as string;
    const shares: VeilShare[] = [];
    for (let seat = 0; seat < this.seatCount; seat++) {
      const share = this.seats[seat]!.share(epoch, position, locked) as VeilShare;
      shares.push(share);
      locked = share.value;
    }
    let card: CardId | null = null;
    for (const session of this.seats) {
      const result = session.open(epoch, position, shares, 'public');
      if ('code' in result) throw new Error(`${result.code}: ${result.message}`);
      card = result.card;
    }
    return card as CardId;
  }
}

/** Opens deck positions from the game's public setup index until it can deal. */
function openSetupCards(room: Room): CardId[] {
  const from = room.seats[0]!.publicSetupPositions(def.veil!, 0);
  const opened: CardId[] = [];
  for (let step = 0; step < 8; step++) {
    if (room.seats[0]!.publicSetupSatisfied(def.veil!, opened)) break;
    opened.push(room.openPublicly(from + step));
  }
  return opened;
}

describe('a veiled round, end to end', () => {
  it('deals every seat a private hand that nobody else can read', async () => {
    const room = new Room(3);
    await room.openRound();
    await room.runCeremony();

    const hands: CardId[][] = [];
    for (let seat = 0; seat < 3; seat++) {
      hands.push([0, 1, 2].map((index) => room.openTo(seat, seat * 3 + index)));
    }

    const all = hands.flat();
    expect(new Set(all).size).toBe(9);
    const deck = new Set(def.veil!.deck(CONFIG).cardIds);
    expect(all.every((card) => deck.has(card))).toBe(true);

    for (let seat = 0; seat < 3; seat++) {
      const known = new Set(room.seats[seat]!.knownFaces().values());
      for (const card of hands[seat] as CardId[]) expect(known.has(card)).toBe(true);
      for (let other = 0; other < 3; other++) {
        if (other === seat) continue;
        const theirs = new Set(room.seats[other]!.knownFaces().values());
        for (const card of hands[seat] as CardId[]) expect(theirs.has(card)).toBe(false);
      }
    }
  });

  it('drives a real Blitz session: hidden hands, an opened discard, a played card', async () => {
    const room = new Room(2);
    await room.openRound();
    await room.runCeremony();

    const publicSetup = openSetupCards(room);
    expect(publicSetup).toHaveLength(1);

    const plan = room.seats[0]!.dealPlan(def.veil!, publicSetup);
    let session = createSession(def, {
      seed: room.seed,
      config: CONFIG,
      seats: 2,
      veiled: true,
      deckOrder: plan.deckOrder,
    });

    expect(session.state.hands[0]).toEqual(['v#0', 'v#1', 'v#2']);
    expect(session.state.discard).toEqual(publicSetup);

    const mine = [0, 1, 2].map((position) => room.openTo(0, position));
    const resolved = room.seats[0]!.revealsFor(session.state.hands[0] as CardId[]);
    expect(resolved?.map(([, card]) => card)).toEqual(mine);

    session = sessionApply(def, session, 0, 'draw.discard').session;
    const discardable = (session.state.hands[0] as CardId[]).find(
      (card) => card !== session.state.drawnFromDiscard,
    ) as CardId;
    const reveals = room.seats[0]!.revealsFor([discardable]);
    expect(reveals).not.toBeNull();
    const played = sessionApply(
      def,
      session,
      0,
      'discard',
      { card: reveals![0]![1] },
      { reveals: reveals! },
    );
    expect(played.rejected).toBeUndefined();
    expect(played.session.state.hands[1]).toEqual(['v#3', 'v#4', 'v#5']);

    const replayed = replaySession(def, room.seed, played.session.log, {
      config: CONFIG,
      seats: 2,
      veiled: true,
      deckOrder: plan.deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(played.session.state));
    expect((replayed.state as BlitzState).hands[1]).toEqual(['v#3', 'v#4', 'v#5']);
  });

  it('keeps a signed chain whose head advances with every ceremony step', async () => {
    const room = new Room(3);
    await room.openRound();
    const before = room.seats[0]!.transcriptRef()?.headHash;
    await room.runCeremony();
    const transcript = room.seats[0]!.transcriptRef();
    expect(transcript?.byKind('ceremony.layer')).toHaveLength(1);
    expect(transcript?.headHash).toHaveLength(64);
    expect(transcript?.headHash).not.toBe(before);
  });
});

describe('the ceremony refuses shortcuts', () => {
  it('will not let a seat lay a layer out of turn', async () => {
    const room = new Room(3);
    await room.openRound();
    expect(await room.seats[1]!.layLayer()).toBeNull();
    expect(await room.seats[2]!.layLayer()).toBeNull();
    expect(await room.seats[0]!.layLayer()).not.toBeNull();
  });

  it('will not adopt a header for a different game, table or rule set', async () => {
    const room = new Room(2);
    const keys = await Promise.all(room.seats.map((session) => session.start()));
    const deck = def.veil!.deck(CONFIG).cardIds;
    const header = await room.seats[0]!.openRound(keys, deck);

    const other = new VeilSession({
      roomCode: 'ABCD',
      seed: room.seed,
      seat: 1,
      seats: 2,
      gameId: 'wildpile',
      config: CONFIG,
    });
    await other.start();
    expect(await other.adoptRound(header)).toMatch(/different game/);

    const wrongRules = new VeilSession({
      roomCode: 'ABCD',
      seed: room.seed,
      seat: 1,
      seats: 2,
      gameId: def.id,
      config: { ...CONFIG, discardLock: !CONFIG.discardLock },
    });
    await wrongRules.start();
    expect(await wrongRules.adoptRound(header)).toMatch(/different rules/);
  });

  it('will not resolve a handle this seat was never dealt', async () => {
    const room = new Room(2);
    await room.openRound();
    await room.runCeremony();
    room.openTo(0, 0);
    expect(room.seats[0]!.revealsFor(['v#0'])).not.toBeNull();
    expect(room.seats[0]!.revealsFor(['v#3'])).toBeNull();
    expect(room.seats[1]!.revealsFor(['v#0'])).toBeNull();
  });
});

describe('the audit', () => {
  it('recomputes every disclosed layer against what was published', async () => {
    const room = new Room(3);
    await room.openRound();
    await room.runCeremony();
    room.openPublicly(0);

    const report = await room.seats[0]!.audit(room.seats[0]!.disclose());
    expect(report.findings.some((finding) => finding.code === 'layer-mismatch')).toBe(false);
    expect(report.layersChecked).toBe(1);
  });

  it('disputes a round when a seat discloses keys that do not match what it published', async () => {
    const room = new Room(3);
    await room.openRound();
    await room.runCeremony();
    const mine = room.seats[0]!.disclose();
    const tampered = mine.map((entry) => ({
      ...entry,
      secret: { ...entry.secret, order: [...entry.secret.order].reverse() },
    }));
    const report = await room.seats[0]!.audit(tampered);
    expect(report.state).toBe('disputed');
    expect(report.findings.some((finding) => finding.code === 'commitment-mismatch')).toBe(true);
  });

  it('never calls an incomplete audit verified', async () => {
    const room = new Room(3);
    await room.openRound();
    await room.runCeremony();
    const report = await room.seats[0]!.audit([]);
    expect(report.state).toBe('disputed');
    expect(countsAsRanked(report.state)).toBe(false);
  });
});

describe('what the room tells the player', () => {
  it('never claims the open tier is private, or Veil cheat-proof', () => {
    expect(auditSummary('open').detail).toMatch(/could read any hand/i);
    expect(auditSummary('veiled').detail).toMatch(/nothing is proven yet/i);
    expect(auditSummary('verified').detail).not.toMatch(/cheat.?proof/i);
    expect(auditSummary('disputed').detail).toMatch(/should not count/i);
    expect(countsAsRanked('veiled')).toBe(false);
    expect(countsAsRanked('verified')).toBe(true);
  });

  it('states the two-seat trade-off instead of quietly picking a threshold', () => {
    const heads = recoveryPolicyFor(2);
    expect(heads.mode).toBe('none');
    expect(heads.disclosure).toMatch(/pauses the round/i);

    const three = recoveryPolicyFor(3);
    expect(three.mode).toBe('threshold');
    expect(three.threshold).toBe(2);
    expect(three.disclosure).toMatch(/could, if they all colluded, open a live hand/i);

    const forgiving = recoveryPolicyFor(4, 'forgiving');
    expect(forgiving.threshold).toBe(1);
    expect(forgiving.disclosure).toMatch(/any single other player could also open a live hand/i);
  });
});
