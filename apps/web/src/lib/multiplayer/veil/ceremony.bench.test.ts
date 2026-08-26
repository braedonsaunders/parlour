/**
 * How long a Veil shuffle ceremony actually takes, on the real SRA path.
 *
 * The ceremony is the one expensive thing the app does: a deck of 2048-bit
 * modular exponentiations per seat per epoch, chunked so the page keeps
 * breathing. Nobody had measured it, and "always on" lives or dies on this
 * number — a four-seat Hearts table pays a fresh ceremony between every hand,
 * so the measurement decides whether that is seconds or a friendship test.
 *
 * Skipped by default like the engine's full-scale sim: run it explicitly with
 *
 *   PARLOUR_VEIL_BENCH=1 pnpm --filter @parlour/web exec vitest run \
 *     src/lib/multiplayer/veil/ceremony.bench.test.ts
 *
 * The wiring mirrors roomSession exactly: every seat runs a real VeilSession
 * and VeilRoom over an in-order in-memory bus, the host publishes the header,
 * layers cascade entry-by-entry (each delivered entry triggers the
 * recipient's next advanceCeremony, as the transport inbox does), the setup
 * card is peeled in public, and the deal plan is read off the epoch. The
 * redeal case is startRecycle over a fresh epoch — the same shape
 * shuffleNextHand runs between hands of a match.
 */

import { stdDeck, type CardId, type VeilSupport } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { VeilRoom } from './room';
import { VeilSession } from './session';
import type { VeilMessage } from './wire';

const DECK = stdDeck();
const BLITZ_HAND = 3;
const PEER = (seat: number) => `bench-peer-${seat}`;
const SEAT_OF = (peerId: string) => Number(peerId.split('-').at(-1));

/** Per-recipient ordered chains, mirroring P2PTransport's veilInbox. */
class BenchMesh {
  private readonly chains = new Map<number, Promise<void>>();

  constructor(private readonly rooms: Map<number, VeilRoom>) {
    for (const seat of rooms.keys()) this.chains.set(seat, Promise.resolve());
  }

  /** Routes one message exactly as sendVeil would: broadcast or addressed. */
  deliver(fromSeat: number, message: VeilMessage, to: string | null): void {
    const targets =
      to === null
        ? [...this.rooms.keys()].filter((seat) => seat !== fromSeat)
        : [SEAT_OF(to)].filter((seat) => seat !== fromSeat && this.rooms.has(seat));
    for (const seat of targets) {
      const room = this.rooms.get(seat)!;
      const chain = this.chains.get(seat)!;
      this.chains.set(
        seat,
        chain.then(async () => {
          await room.receive(PEER(fromSeat), message);
          // The transport inbox advances the cascade whenever a layer lands.
          if (message.type === 'veil.entry') {
            const payload = message.entry.payload as { epoch?: unknown };
            if (typeof payload.epoch === 'number') await room.advanceCeremony(payload.epoch);
          }
        }),
      );
    }
  }

  settle(): Promise<unknown> {
    return Promise.all([...this.chains.values()]).then(() => undefined);
  }
}

interface BenchTable {
  mesh: BenchMesh;
  sessions: VeilSession[];
  rooms: Map<number, VeilRoom>;
}

function buildTable(seats: number): BenchTable {
  const sessions: VeilSession[] = [];
  const roomsBySeat = new Map<number, VeilRoom>();
  let mesh: BenchMesh | null = null;
  const route = (fromSeat: number) => (message: VeilMessage, to: string | null) => {
    // Rooms are constructed before the mesh exists; the first send cannot
    // happen until every room announced, by which point routing is live.
    mesh?.deliver(fromSeat, message, to);
  };
  for (let seat = 0; seat < seats; seat++) {
    const session = new VeilSession({
      roomCode: 'BENCH',
      seed: 20260826,
      seat,
      seats,
      gameId: 'blitz',
      config: {},
    });
    const room = new VeilRoom(
      session,
      {
        send: route(seat),
        peerIdForSeat: (other) => PEER(other),
        seatForPeer: (peerId) => SEAT_OF(peerId),
      },
      seats,
    );
    sessions.push(session);
    roomsBySeat.set(seat, room);
  }
  mesh = new BenchMesh(roomsBySeat);
  return { mesh, sessions, rooms: roomsBySeat };
}

const BLITZ_SUPPORT: VeilSupport = {
  deck: () => DECK,
  publicSetupFrom: (count: number) => count * BLITZ_HAND,
  publicSetupReady: (opened: readonly CardId[]) => opened.length === 1,
};

async function waitReady(session: VeilSession, epoch: number): Promise<boolean> {
  for (let attempt = 0; attempt < 24_000; attempt++) {
    if (session.progress(epoch).ready) return true;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  return false;
}

interface DealTimings {
  laidMs: number;
  openMs: number;
}

async function runOpeningDeal(table: BenchTable, seats: number): Promise<DealTimings> {
  const host = table.rooms.get(0)!;
  const hostSession = table.sessions[0]!;
  await Promise.all(table.sessions.map((session) => session.start()));
  await Promise.all([...table.rooms.values()].map((room) => room.announce()));
  expect(host.keysReady).toBe(true);
  await host.publishHeader(DECK.cardIds);

  const started = performance.now();
  for (;;) {
    if (hostSession.progress(0).ready) break;
    await host.advanceCeremony(0);
    await table.mesh.settle();
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const laidMs = performance.now() - started;

  // Peel the face-up starter in public, then read the deal plan.
  const openedAt = performance.now();
  const card: CardId = await host.open(0, seats * BLITZ_HAND, 'public');
  await table.mesh.settle();
  const openMs = performance.now() - openedAt;
  expect(typeof card).toBe('string');
  const plan = hostSession.dealPlan(BLITZ_SUPPORT, [card]);
  expect(plan.deckOrder).toHaveLength(DECK.cardIds.length);
  expect(plan.publicSetup).toEqual([card]);
  return { laidMs, openMs };
}

async function runRedeal(table: BenchTable, seats: number): Promise<number> {
  const host = table.rooms.get(0)!;
  const hostSession = table.sessions[0]!;
  const participants = Array.from({ length: seats }, (_, seat) => seat);
  const started = performance.now();
  await host.startRecycle(1, DECK.cardIds, participants);
  const ready = await waitReady(hostSession, 1);
  await table.mesh.settle();
  expect(ready).toBe(true);
  return performance.now() - started;
}

describe('veil ceremony cost', () => {
  const timeout = 600_000;
  it.skipIf(!process.env.PARLOUR_VEIL_BENCH)(
    'measures the real SRA path',
    { timeout },
    async () => {
      const rows: string[] = [];
      rows.push('seats   lay-layers   public-open   deal-total   mid-hand-redeal');
      for (const seats of [2, 3, 4, 6]) {
        const table = buildTable(seats);
        const { laidMs, openMs } = await runOpeningDeal(table, seats);
        const redealMs = await runRedeal(table, seats);
        const pad = (ms: number) => `${ms.toFixed(0).padStart(7)}ms`;
        rows.push(
          `${String(seats).padStart(5)}  ${pad(laidMs)}  ${pad(openMs)}  ${pad(laidMs + openMs)}  ${pad(redealMs)}`,
        );
      }
      // eslint-disable-next-line no-console -- the report is the point of the run
      console.log(`\nVeil ceremony wall time (Node, real SRA)\n${rows.join('\n')}\n`);
      expect(rows).toHaveLength(5);
    },
  );
});
