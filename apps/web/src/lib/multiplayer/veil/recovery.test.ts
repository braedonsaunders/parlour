import { describe, expect, it, vi } from 'vitest';

// Recovery runs a real ceremony to have a real layer to lose.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

import { createBlitzDef, blitzConfigSchema } from '@parlour/game-blitz';
import type { CardId } from '@parlour/engine';
import { VeilRoom, type VeilLink } from './room';
import { VeilSession } from './session';
import { packageRecovery, recoverLayer, recoveryPolicyFor } from './recovery';
import { parseVeilMessage, type VeilMessage } from './wire';
import { randomBytes } from './bytes';
import { generateLayerKey } from './sra';

const def = createBlitzDef();
const CONFIG = blitzConfigSchema.defaults();

/**
 * A twelve-card slice of the real deck. Recovery is about layers, not deck
 * size, and a full 52-card ceremony per test is four times the modular
 * exponentiation for no extra coverage.
 */
const DECK = def.veil!.deck(CONFIG).cardIds.slice(0, 12);

/**
 * A mesh that can lose seats.
 *
 * Dropping a seat here is the same thing a real disconnect does: the peer stops
 * answering and stops being addressable. Nothing pretends the seat is still
 * there, so an opening that needs its layer genuinely cannot complete until the
 * room rebuilds it.
 */
class Mesh {
  readonly rooms: VeilRoom[] = [];
  readonly sessions: VeilSession[] = [];
  readonly traffic: { from: number; to: number | null; message: VeilMessage }[] = [];
  private readonly gone = new Set<number>();
  private readonly inbox: (() => Promise<void>)[] = [];

  constructor(readonly seats: number) {
    for (let seat = 0; seat < seats; seat++) {
      const session = new VeilSession({
        roomCode: 'ABCD',
        seed: 77,
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
        if (this.gone.has(seat)) return;
        const target = to === null ? null : Number(to.replace('peer:', ''));
        this.traffic.push({ from: seat, to: target, message });
        const wire = JSON.stringify(message);
        for (let other = 0; other < this.seats; other++) {
          if (other === seat || this.gone.has(other)) continue;
          if (target !== null && target !== other) continue;
          this.inbox.push(async () => {
            const parsed = parseVeilMessage(wire);
            if (!parsed) throw new Error('the mesh delivered a message the schema rejects');
            await this.rooms[other]!.receive(`peer:${seat}`, parsed);
          });
        }
      },
      peerIdForSeat: (target) => (this.gone.has(target) ? null : `peer:${target}`),
      seatForPeer: (peerId) => Number(peerId.replace('peer:', '')),
    };
  }

  /** Pulls a seat's plug: unaddressable, and it neither sends nor receives. */
  drop(seat: number): void {
    this.gone.add(seat);
    for (let other = 0; other < this.seats; other++) {
      if (other === seat) continue;
      this.rooms[other]!.markSeatLost(seat);
    }
  }

  async settle(): Promise<void> {
    for (let guard = 0; guard < 5_000 && this.inbox.length > 0; guard++) {
      const next = this.inbox.shift();
      if (next) await next();
    }
  }

  async openRound(): Promise<void> {
    for (const room of this.rooms) await room.announce();
    await this.settle();
    await this.rooms[0]!.publishHeader(DECK);
    await this.settle();
  }

  async runCeremony(): Promise<void> {
    for (let seat = 0; seat < this.seats; seat++) {
      expect(await this.rooms[seat]!.advanceCeremony()).toBe(true);
      await this.settle();
    }
  }

  /**
   * Pumps the mesh until a request settles. The yield to a macrotask matters: a
   * peel hop awaits `crypto.subtle`, so a microtask-only spin would drain the
   * inbox, find it empty, and give up before the digest ever resolved.
   */
  async pump<T>(pending: Promise<T>): Promise<T> {
    // Claim the rejection now. An opening that fails the moment it starts —
    // a seat is gone and unrecoverable — would otherwise sit unhandled for the
    // whole pump, and Node reports that as an error even though the caller is
    // about to await it.
    pending.catch(() => undefined);
    for (let round = 0; round < 60; round++) {
      await this.settle();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return pending;
  }
}

async function dealtRoom(seats: number): Promise<Mesh> {
  const mesh = new Mesh(seats);
  await mesh.openRound();
  await mesh.runCeremony();
  return mesh;
}

describe('recovery material is handed out during the ceremony', () => {
  it('gives every other seat exactly one share, addressed, never broadcast', async () => {
    const mesh = await dealtRoom(4);
    const packets = mesh.traffic.filter((entry) => entry.message.type === 'veil.recovery');

    // Four seats, three holders each.
    expect(packets).toHaveLength(12);
    expect(packets.every((entry) => entry.to !== null)).toBe(true);
    for (const entry of packets) {
      const pack = (entry.message as Extract<VeilMessage, { type: 'veil.recovery' }>).pack;
      expect(pack.shares).toHaveLength(1);
      expect(pack.shares[0]!.holder).toBe(entry.to);
    }
  });

  it('leaves every live seat holding one share of every other seat', async () => {
    const mesh = await dealtRoom(4);
    for (const seat of [0, 1, 2, 3]) {
      for (const other of [0, 1, 2, 3]) {
        const share = mesh.sessions[seat]!.shareOfLayer(other, 0);
        if (seat === other) expect(share).toBeNull();
        else expect(share).not.toBeNull();
      }
    }
  });

  it('hands out nothing at two seats, because there is no honest threshold', async () => {
    const mesh = await dealtRoom(2);
    expect(mesh.traffic.filter((entry) => entry.message.type === 'veil.recovery')).toEqual([]);
    expect(mesh.sessions[0]!.shareOfLayer(1, 0)).toBeNull();
  });
});

describe('a seat disconnects mid-round', () => {
  it('stalls an opening that needs the missing layer, and says why', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(2);
    await expect(mesh.pump(mesh.rooms[0]!.open(0, 5, 'private'))).rejects.toThrow(
      /Seat 2 left and their layer has not been recovered/,
    );
  });

  it('rebuilds the missing layer from a quorum and finishes the deal', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(2);

    expect(await mesh.pump(mesh.rooms[0]!.recoverSeat(2, 0))).toBe(true);
    expect(mesh.rooms[0]!.recoveredSeats()).toEqual([2]);

    const card = await mesh.pump(mesh.rooms[0]!.open(0, 5, 'private'));
    expect(DECK).toContain(card);
  });

  it('keeps dealing to the seats that are still here', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(3);
    await mesh.pump(mesh.rooms[0]!.recoverSeat(3, 0));
    await mesh.pump(mesh.rooms[1]!.recoverSeat(3, 0));

    const first = await mesh.pump(mesh.rooms[0]!.open(0, 0, 'private'));
    const second = await mesh.pump(mesh.rooms[1]!.open(0, 1, 'private'));
    expect(first).not.toBe(second);
    expect(DECK).toContain(first);
    expect(DECK).toContain(second);
  });

  it('survives the host itself going away', async () => {
    const mesh = await dealtRoom(4);
    // Seat 0 is the host: it published the header and laid the first layer.
    mesh.drop(0);
    const newHost = mesh.rooms[1]!;

    expect(await mesh.pump(newHost.recoverSeat(0, 0))).toBe(true);
    const card = await mesh.pump(newHost.open(0, 4, 'private'));
    expect(DECK).toContain(card);
    expect(newHost.recoveredSeats()).toEqual([0]);
  });

  it('recovers only the seat that left — everyone else keeps their privacy', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(2);
    await mesh.pump(mesh.rooms[0]!.recoverSeat(2, 0));

    expect(mesh.rooms[0]!.recoveredSeats()).toEqual([2]);
    // Seat 0 cannot stand in for a seat that is still sitting there.
    expect(mesh.sessions[0]!.canCoverSeat(1, 0)).toBe(false);
    expect(mesh.sessions[0]!.canCoverSeat(3, 0)).toBe(false);
    expect(mesh.sessions[0]!.shareAs(1, 0, 0, mesh.sessions[0]!.lockedAt(0, 0)!)).toBeNull();
  });

  it('shares one round of collection between openings that stall together', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(2);
    const a = mesh.rooms[0]!.recoverSeat(2, 0);
    const b = mesh.rooms[0]!.recoverSeat(2, 0);
    expect(a).toBe(b);
    expect(await mesh.pump(a)).toBe(true);
    const requests = mesh.traffic.filter((entry) => entry.message.type === 'veil.recover.request');
    expect(requests).toHaveLength(1);
  });
});

describe('what recovery refuses to do', () => {
  it('will not recover at two seats — the round pauses and the message says so', async () => {
    const mesh = await dealtRoom(2);
    mesh.drop(1);
    expect(await mesh.rooms[0]!.recoverSeat(1, 0)).toBe(false);
    await expect(mesh.pump(mesh.rooms[0]!.open(0, 0, 'private'))).rejects.toThrow(
      /With two players there is no way to reopen their cards/,
    );
  });

  it('will not answer a recovery request for a seat that is still connected', async () => {
    const mesh = await dealtRoom(4);
    // Seat 0 asks for seat 2 without anyone agreeing seat 2 has gone.
    await mesh.rooms[1]!.receive('peer:0', {
      type: 'veil.recover.request',
      epoch: 0,
      lostSeat: 2,
    });
    await mesh.settle();
    expect(mesh.traffic.filter((entry) => entry.message.type === 'veil.recover.offer')).toEqual([]);
  });

  it('will not answer a request for its own layer', async () => {
    const mesh = await dealtRoom(4);
    mesh.drop(2);
    await mesh.rooms[1]!.receive('peer:0', {
      type: 'veil.recover.request',
      epoch: 0,
      lostSeat: 1,
    });
    await mesh.settle();
    const offers = mesh.traffic.filter((entry) => entry.message.type === 'veil.recover.offer');
    expect(offers.every((entry) => entry.from !== 1)).toBe(true);
  });

  it('gives up rather than hanging when too few holders answer', async () => {
    const mesh = await dealtRoom(4);
    // Three of four gone leaves one seat, below the threshold of two.
    mesh.drop(1);
    mesh.drop(2);
    mesh.drop(3);
    expect(await mesh.pump(mesh.rooms[0]!.recoverSeat(1, 0))).toBe(false);
    expect(mesh.rooms[0]!.recoveredSeats()).toEqual([]);
  });

  it('refuses a quorum of shares that do not rebuild the sealing key', async () => {
    const policy = recoveryPolicyFor(4);
    const secret = { epoch: 0, key: generateLayerKey(), order: [1, 0], salt: 'ab' };
    const packs = await packageRecovery(secret, 0, policy, [1, 2, 3], randomBytes);
    const wrong = ['01' + 'ff'.repeat(32), '02' + 'ee'.repeat(32)];
    const fault = await recoverLayer(packs!, wrong, policy);
    expect('code' in fault && fault.code).toBe('undecryptable');
  });

  it('refuses a sealed layer that was edited after it was committed to', async () => {
    const policy = recoveryPolicyFor(4);
    const secret = { epoch: 0, key: generateLayerKey(), order: [1, 0], salt: 'ab' };
    const pack = (await packageRecovery(secret, 0, policy, [1, 2, 3], randomBytes))!;
    const tampered = { ...pack, sealed: pack.sealed.replace(/^../, 'ff') };
    const fault = await recoverLayer(
      tampered,
      pack.shares.map((share) => share.share),
      policy,
    );
    expect('code' in fault && fault.code).toBe('tampered');
  });

  it('will not let a seat recover its own layer', async () => {
    const mesh = await dealtRoom(4);
    const result = await mesh.sessions[0]!.recover(0, 0, []);
    expect('code' in result && result.code).toBe('below-threshold');
  });

  it('will not recover a seat that never sealed a layer', async () => {
    const mesh = await dealtRoom(4);
    const result = await mesh.sessions[0]!.recover(1, 9, ['01ff']);
    expect('code' in result && result.message).toMatch(/never published a sealed layer/);
  });
});

describe('recovery is a privacy loss, and is reported as one', () => {
  it('reopens the departed seat’s dealt cards to whoever rebuilt the layer', async () => {
    const mesh = await dealtRoom(4);

    // Seat 2 privately learns one of its cards while it is still connected.
    const before = (await mesh.pump(mesh.rooms[2]!.open(0, 6, 'private'))) as CardId;
    expect(new Set(mesh.sessions[0]!.knownFaces().values()).has(before)).toBe(false);

    mesh.drop(2);
    await mesh.pump(mesh.rooms[0]!.recoverSeat(2, 0));
    const after = await mesh.pump(mesh.rooms[0]!.open(0, 6, 'private'));

    // The card seat 2 held is now readable by the seat that rebuilt the layer.
    // That is the bargain, and `recoveredSeats` is how the room admits it.
    expect(after).toBe(before);
    expect(mesh.rooms[0]!.recoveredSeats()).toContain(2);
  });
});
