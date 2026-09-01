import { describe, expect, it, vi } from 'vitest';

// A real 52-card ceremony is thousands of 2048-bit modular exponentiations.
// That is the honest cost of Veil, so these tests get room to pay it rather
// than pretending the shuffle is free.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import { createBlitzDef, blitzConfigSchema } from '@parlour/game-blitz';
import type { CardId } from '@parlour/engine';
import { VeilRoom, type VeilLink } from './room';
import { VeilSession } from './session';
import type { VeilMessage } from './wire';
import { parseVeilMessage } from './wire';

const def = createBlitzDef();
const CONFIG = blitzConfigSchema.defaults();

/**
 * An in-memory mesh with the same delivery rules as the real transport: every
 * message is serialised and re-validated on the way in, and a message addressed
 * to one peer reaches only that peer.
 */
class Mesh {
  readonly rooms: VeilRoom[] = [];
  readonly sessions: VeilSession[] = [];
  /** every packet, so a test can prove what did and did not go on the wire */
  readonly traffic: { from: number; to: number | null; message: VeilMessage }[] = [];
  private readonly inbox: (() => Promise<void>)[] = [];

  constructor(readonly seats: number) {
    for (let seat = 0; seat < seats; seat++) {
      const session = new VeilSession({
        roomCode: 'ABCD',
        seed: 99,
        seat,
        seats,
        gameId: def.id,
        config: CONFIG,
      });
      this.sessions.push(session);
      this.rooms.push(new VeilRoom(session, this.linkFor(seat), seats));
    }
  }

  private linkFor(seat: number): VeilLink {
    return {
      send: (message, to) => {
        const target = to === null ? null : Number(to.replace('peer:', ''));
        this.traffic.push({ from: seat, to: target, message });
        const wire = JSON.stringify(message);
        for (let other = 0; other < this.seats; other++) {
          if (other === seat) continue;
          if (target !== null && target !== other) continue;
          this.inbox.push(async () => {
            const parsed = parseVeilMessage(wire);
            if (!parsed) throw new Error('the mesh delivered a message the schema rejects');
            await this.rooms[other]!.receive(`peer:${seat}`, parsed);
          });
        }
      },
      peerIdForSeat: (target) => `peer:${target}`,
      seatForPeer: (peerId) => Number(peerId.replace('peer:', '')),
    };
  }

  /** Runs every queued delivery, including ones produced while draining. */
  async settle(): Promise<void> {
    for (let guard = 0; guard < 5_000 && this.inbox.length > 0; guard++) {
      const next = this.inbox.shift();
      if (next) await next();
    }
  }

  async openRound(): Promise<void> {
    for (const room of this.rooms) await room.announce();
    await this.settle();
    await this.rooms[0]!.publishHeader(def.veil!.deck(CONFIG).cardIds);
    await this.settle();
  }

  async runCeremony(): Promise<void> {
    for (let seat = 0; seat < this.seats; seat++) {
      expect(await this.rooms[seat]!.advanceCeremony()).toBe(true);
      await this.settle();
    }
  }

  /** Starts an opening and pumps the mesh until the chain comes home. */
  async open(seat: number, position: number, visibility: 'private' | 'public' = 'private') {
    const pending = this.rooms[seat]!.open(0, position, visibility);
    for (let round = 0; round < 20; round++) await this.settle();
    return pending;
  }
}

describe('the ceremony over a mesh', () => {
  it('collects every seat’s key before a header can be sealed', async () => {
    const mesh = new Mesh(3);
    expect(mesh.rooms[0]!.keysReady).toBe(false);
    for (const room of mesh.rooms) await room.announce();
    await mesh.settle();
    expect(mesh.rooms.every((room) => room.keysReady)).toBe(true);
    expect(mesh.rooms[0]!.keyList().every((key) => key.length > 0)).toBe(true);
  });

  it('runs the layers in seat order and refuses to run them out of order', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    expect(await mesh.rooms[1]!.advanceCeremony()).toBe(false);
    expect(await mesh.rooms[0]!.advanceCeremony()).toBe(true);
    await mesh.settle();
    expect(await mesh.rooms[2]!.advanceCeremony()).toBe(false);
    expect(await mesh.rooms[1]!.advanceCeremony()).toBe(true);
  });

  it('leaves every seat holding the same locked deck', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    const decks = mesh.sessions.map((session) => session.epochAt(0)?.deck);
    expect(decks[0]).not.toBeNull();
    expect(decks[1]).toEqual(decks[0]);
    expect(decks[2]).toEqual(decks[0]);
  });

  it('re-veils a spent pile with the surviving seats and publishes no face-to-handle map', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    const cards = def.veil!.deck(CONFIG).cardIds.slice(0, 6);

    await mesh.rooms[0]!.startRecycle(1, cards, [0, 2]);
    await mesh.settle();
    expect(await mesh.rooms[2]!.advanceCeremony(1)).toBe(true);
    await mesh.settle();

    for (const session of mesh.sessions) {
      expect(session.progress(1)).toMatchObject({ laid: 2, seats: 2, ready: true });
      expect(session.participantsFor(1)).toEqual([0, 2]);
    }
    const declaration = mesh.traffic.find(
      (packet) =>
        packet.message.type === 'veil.entry' && packet.message.entry.kind === 'ceremony.recycle',
    );
    expect(declaration?.message).toMatchObject({
      entry: { payload: { epoch: 1, cards, participants: [0, 2] } },
    });
    expect(JSON.stringify(declaration)).not.toContain('v#');

    const pending = mesh.rooms[0]!.open(1, 0, 'private');
    for (let round = 0; round < 20; round++) await mesh.settle();
    await expect(pending).resolves.toBeTypeOf('string');
  });
});

describe('opening a card over a mesh', () => {
  it('walks the peel chain and gives the card only to the seat that asked', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();

    const card = await mesh.open(1, 4);
    expect(def.veil!.deck(CONFIG).cardIds).toContain(card);

    expect(new Set(mesh.sessions[1]!.knownFaces().values()).has(card as CardId)).toBe(true);
    expect(new Set(mesh.sessions[0]!.knownFaces().values()).has(card as CardId)).toBe(false);
    expect(new Set(mesh.sessions[2]!.knownFaces().values()).has(card as CardId)).toBe(false);
  });

  it('never broadcasts an intermediate value — every peel hop is addressed', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    await mesh.open(1, 4);

    const leaked = mesh.traffic.filter(
      (packet) =>
        packet.to === null &&
        (packet.message.type === 'veil.peel' || packet.message.type === 'veil.share'),
    );
    expect(leaked).toEqual([]);
  });

  it('deals a distinct card to every seat that asks', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();

    const dealt: CardId[] = [];
    for (let position = 0; position < 6; position++) {
      dealt.push(await mesh.open(position % 3, position));
    }
    expect(new Set(dealt).size).toBe(6);
  });

  it('keeps simultaneous private openings isolated by requester and position', async () => {
    const mesh = new Mesh(2);
    await mesh.openRound();
    await mesh.runCeremony();

    const first = mesh.rooms[0]!.open(0, 0, 'private');
    const second = mesh.rooms[1]!.open(0, 3, 'private');
    for (let round = 0; round < 20; round++) await mesh.settle();

    await expect(first).resolves.toBeTypeOf('string');
    await expect(second).resolves.toBeTypeOf('string');
  });

  it('records a receipt for every hop it took part in', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    await mesh.open(1, 4);

    for (const room of mesh.rooms) {
      const receipts = room.peelReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0]!.digest).toHaveLength(64);
      expect(receipts[0]!.position).toBe(4);
    }
  });

  it('coalesces concurrent asks for one position, and refuses a different audience', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    // Fast tables ask twice as a matter of course — every applied packet
    // re-lists the handles this seat cannot read while the first chain is
    // still in flight — so a duplicate ask shares the chain instead of erroring.
    const first = mesh.rooms[1]!.open(0, 2, 'private');
    const second = mesh.rooms[1]!.open(0, 2, 'private');
    // A 'public' ask files an audit opening a 'private' one must not, so the
    // mismatch is the one shape that still refuses.
    await expect(mesh.rooms[1]!.open(0, 2, 'public')).rejects.toThrow(/different audience/);
    for (let round = 0; round < 20; round++) await mesh.settle();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    // One chain ran, not two: every seat peeled this position exactly once.
    for (const room of mesh.rooms) {
      expect(room.peelReceipts().filter((r) => r.position === 2)).toHaveLength(1);
    }
  });

  it('refuses to open before the ceremony has closed', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await expect(mesh.rooms[0]!.open(0, 0, 'private')).rejects.toThrow(/has not closed/);
  });

  it('gives up rather than hanging when a seat is gone', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    const room = new VeilRoom(
      mesh.sessions[0]!,
      { ...mesh['linkFor'](0), peerIdForSeat: () => null },
      3,
    );
    await expect(room.open(0, 0, 'private')).rejects.toThrow(/has not been recovered yet/);
  });
});

describe('the mesh rejects bad traffic', () => {
  it('rejects a share from a seat answering outside its peel-chain turn', async () => {
    const mesh = new Mesh(3);
    await mesh.openRound();
    await mesh.runCeremony();
    const locked = mesh.sessions[0]!.lockedAt(0, 0)!;
    const outOfTurn = mesh.sessions[2]!.share(0, 0, locked)!;
    const pending = mesh.rooms[0]!.open(0, 0, 'private');

    await mesh.rooms[0]!.receive('peer:2', {
      type: 'veil.share',
      share: outOfTurn,
      forSeat: 0,
      sequence: 0,
    });

    await expect(pending).rejects.toThrow(/outside its peel-chain turn/);
  });

  it('will not adopt a header that describes another room', async () => {
    const mesh = new Mesh(2);
    for (const room of mesh.rooms) await room.announce();
    await mesh.settle();
    await expect(
      mesh.rooms[1]!.receive('peer:0', {
        type: 'veil.header',
        header: {
          roundId: 'ABCD:99:0',
          gameId: 'wildpile',
          rulesHash: 'a'.repeat(64),
          seats: 2,
          keys: mesh.rooms[0]!.keyList(),
          deck: ['S1', 'S2'],
        },
      }),
    ).rejects.toThrow(/different game/);
  });

  it('shrugs off a replayed entry, but refuses one that contradicts the head', async () => {
    const mesh = new Mesh(2);
    await mesh.openRound();
    await mesh.rooms[0]!.advanceCeremony();
    await mesh.settle();
    // A duplicate of an entry already in the chain is ordinary traffic — a
    // peer replaying after a reconnect — and must not read as a fork.
    const accepted = mesh.sessions[1]!.transcriptRef()!.all().length;
    const replayed = mesh.sessions[0]!.transcriptRef()!.all()[0]!;
    await mesh.rooms[1]!.receive('peer:0', { type: 'veil.entry', entry: replayed });
    expect(mesh.sessions[1]!.transcriptRef()!.all()).toHaveLength(accepted);
    // An entry AT the head that does not extend it is a real fork: refused.
    const forged = { ...replayed, seq: accepted, previous: 'f'.repeat(64) };
    await expect(
      mesh.rooms[1]!.receive('peer:0', { type: 'veil.entry', entry: forged }),
    ).rejects.toThrow(/transcript rejected/);
  });
});
