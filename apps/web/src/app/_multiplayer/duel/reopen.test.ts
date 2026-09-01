import { makeRng } from '@parlour/engine';
import { blitzConfigSchema } from '@parlour/game-blitz';
import { wildpileConfig } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { clearActiveMultiplayerSession, MultiplayerRoomSession } from '../roomSession';
import { stepActor, type ActorReport } from './actors';
import { DuelNet } from './netsim';

/**
 * Play again means play AGAIN — the next hand deals the moment the button is
 * pressed, no lobby, no detour:
 *
 * - with the opponent still seated, the rematch deals both of them in at once
 *   and STAYS VEILED (it used to quietly downgrade the second match to open);
 * - after a walkover, the departed chair becomes a bot takeover and the deal
 *   happens anyway — the survivor keeps playing now, and the dropped player
 *   can still reclaim their own seat by coming back.
 */

const WILD_CONFIG = wildpileConfig.resolve({ handSize: 5 });
const BLITZ_CONFIG = blitzConfigSchema.resolve({});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(assertion: () => void, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await sleep(15);
    }
  }
}

describe('play again deals immediately', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.close());
    clearActiveMultiplayerSession();
  });

  function seatFactory(net: DuelNet, extra: { reconnectGraceMs?: number } = {}) {
    return (label: string, name: string) => {
      const session = new MultiplayerRoomSession(
        { name, avatarId: 'ember', profileId: label },
        {
          signaling: net.signaling(label),
          peerConnection: net.rtcFactory(label),
          seed: 4242,
          // Near production shape: the rematch ceremony's SRA math runs
          // in-thread here, and a hair-trigger timeout reads a host that is
          // busy SHUFFLING as a host that died — the guest then deposes it
          // mid-deal and the migration stomps the fresh match.
          heartbeatIntervalMs: 150,
          heartbeatTimeoutMs: 5_000,
          ...extra,
        },
      );
      sessions.push(session);
      return session;
    };
  }

  it('deals the walkover survivor straight into the next hand against a takeover bot', async () => {
    const net = new DuelNet({ seed: 8101 });
    const rng = makeRng(8101);
    const seat = seatFactory(net, { reconnectGraceMs: 1_000 });
    const host = seat('again-host', 'Hosta');
    const guest = seat('again-guest', 'Guesty');
    const room = await host.create({
      gameId: 'wildpile',
      seats: 2,
      security: 'veil',
      config: WILD_CONFIG,
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1), 10_000);
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 20_000);
    const firstSeed = host.getSnapshot().session!.seed;

    const report: ActorReport = { errors: [], staleTaps: 0, sent: 0 };
    await eventually(() => {
      stepActor(host, 'wildpile', rng, report);
      stepActor(guest, 'wildpile', rng, report);
      expect(host.getSnapshot().session!.log.length).toBeGreaterThanOrEqual(4);
    }, 30_000);

    net.crash('again-guest');
    await eventually(() => {
      expect(host.getSnapshot().session?.result?.reason).toBe('opponent-left');
    }, 15_000);

    // Play again: the next hand is on the table at once — same room, same
    // code, no lobby — with the departed chair now a bot that actually plays.
    await host.rematch();
    const dealt = host.getSnapshot();
    expect(dealt.stage).toBe('table');
    expect(dealt.room?.code).toBe(room.code);
    expect(dealt.session?.status).toBe('playing');
    expect(dealt.session?.seed).not.toBe(firstSeed);
    expect(dealt.session?.log ?? []).toHaveLength(0);
    expect(dealt.seats.find((chair) => chair.seat === 1)).toMatchObject({
      bot: true,
      connected: false,
    });
    // The rematch stays veiled: a fresh ceremony ran for the fresh deck.
    expect(dealt.security.tier).toBe('veil');

    // The match actually moves: the host acts, the takeover bot answers.
    await eventually(() => {
      stepActor(host, 'wildpile', rng, report);
      expect(host.getSnapshot().session!.log.length).toBeGreaterThan(3);
    }, 30_000);
    expect(report.errors, report.errors.join('\n')).toEqual([]);
    expect(host.getSnapshot().error).toBeNull();
  }, 150_000);

  it('keeps a two-human rematch veiled and deals both seats at once', async () => {
    const net = new DuelNet({ seed: 8202 });
    const rng = makeRng(8202);
    const seat = seatFactory(net);
    const host = seat('again2-host', 'Hosta');
    const guest = seat('again2-guest', 'Guesty');
    const room = await host.create({
      gameId: 'blitz',
      seats: 2,
      security: 'veil',
      config: BLITZ_CONFIG,
    });
    await guest.join(room.code);
    await eventually(() => expect(guest.getSnapshot().localSeat).toBe(1), 10_000);
    await host.start();
    await eventually(() => expect(guest.getSnapshot().stage).toBe('table'), 20_000);
    const firstSeed = host.getSnapshot().session!.seed;

    // Blitz rounds die fast under random play; drive both seats to the end.
    const report: ActorReport = { errors: [], staleTaps: 0, sent: 0 };
    await eventually(() => {
      stepActor(host, 'blitz', rng, report, 1);
      stepActor(guest, 'blitz', rng, report, 1);
      expect(host.getSnapshot().session?.status).toBe('ended');
      // The GUEST presses the button below, so the GUEST must have seen the
      // end: play-again on a table you still believe is live is the harmless
      // double-tap no-op, and this test would be testing nothing.
      expect(guest.getSnapshot().session?.status).toBe('ended');
    }, 60_000);

    // Either player may press the button; the guest exercises the request path.
    await guest.rematch();
    await eventually(() => {
      for (const [who, peer] of [
        ['host', host],
        ['guest', guest],
      ] as const) {
        const snapshot = peer.getSnapshot();
        const tag = `${who}: seed=${snapshot.session?.seed} status=${snapshot.session?.status} err=${snapshot.error} log=${snapshot.session?.log.length}`;
        expect(snapshot.stage, tag).toBe('table');
        expect(snapshot.session?.seed, tag).not.toBe(firstSeed);
        // The second match is as private as the first — no silent downgrade.
        expect(snapshot.security.tier, tag).toBe('veil');
      }
      expect(guest.getSnapshot().session?.seed).toBe(host.getSnapshot().session?.seed);
    }, 30_000);

    // Both seats play the fresh veiled hand — unless it opened on a dealt 31,
    // which ends a Blitz round before anyone moves — and agree on every packet.
    if (host.getSnapshot().session?.status === 'playing') {
      const before = host.getSnapshot().session!.log.length;
      await eventually(() => {
        stepActor(host, 'blitz', rng, report);
        stepActor(guest, 'blitz', rng, report);
        expect(host.getSnapshot().session!.log.length).toBeGreaterThan(before + 2);
      }, 30_000);
    }
    await eventually(() => {
      expect(guest.getSnapshot().session!.lastAppliedHash).toBe(
        host.getSnapshot().session!.lastAppliedHash,
      );
    }, 10_000);
    expect(report.errors, report.errors.join('\n')).toEqual([]);
  }, 150_000);
});
