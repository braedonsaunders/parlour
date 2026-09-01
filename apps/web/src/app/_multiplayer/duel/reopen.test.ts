import { makeRng } from '@parlour/engine';
import { wildpileConfig } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { clearActiveMultiplayerSession, MultiplayerRoomSession } from '../roomSession';
import { stepActor, type ActorReport } from './actors';
import { DuelNet } from './netsim';

/**
 * The full "opponent walked out" story, end to end, as a playtest reported it:
 *
 * 1. mid-match the opponent's device dies;
 * 2. the held chair must NOT read as a bot — nothing is playing it — and the
 *    hold must name who the table is waiting for;
 * 3. the walkover lands promptly once the grace runs out;
 * 4. "Play again" reopens the SAME room as a lobby — same code, same share
 *    link — instead of dead-ending at the game shelf;
 * 5. somebody entirely new joins that code and the next match deals and plays.
 */

const WILD_CONFIG = wildpileConfig.resolve({ handSize: 5 });

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

describe('a walkover reopens the room', () => {
  const sessions: MultiplayerRoomSession[] = [];

  afterEach(() => {
    sessions.splice(0).forEach((session) => session.close());
    clearActiveMultiplayerSession();
  });

  it('holds the chair honestly, awards the walkover promptly, then seats a stranger', async () => {
    const net = new DuelNet({ seed: 7101 });
    const rng = makeRng(7101);
    const graceMs = 1_200;
    const heartbeat = { heartbeatIntervalMs: 150, heartbeatTimeoutMs: 900 };
    const seat = (label: string, name: string) => {
      const session = new MultiplayerRoomSession(
        { name, avatarId: 'ember', profileId: label },
        {
          signaling: net.signaling(label),
          peerConnection: net.rtcFactory(label),
          seed: 7101,
          reconnectGraceMs: graceMs,
          ...heartbeat,
        },
      );
      sessions.push(session);
      return session;
    };

    const host = seat('reopen-host', 'Hosta');
    const guest = seat('reopen-guest', 'Guesty');
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

    // A few real plies so the drop lands mid-game, not on a fresh deal.
    const report: ActorReport = { errors: [], staleTaps: 0, sent: 0 };
    await eventually(() => {
      stepActor(host, 'wildpile', rng, report);
      stepActor(guest, 'wildpile', rng, report);
      expect(host.getSnapshot().session!.log.length).toBeGreaterThanOrEqual(4);
    }, 30_000);

    // 1. The opponent's device dies.
    const crashedAt = Date.now();
    net.crash('reopen-guest');

    // 2. During the hold the chair stays THEIR chair: away, not a bot, and
    //    the pause names them. A bot chip over a seat nothing is playing was
    //    the "dead minute" the playtest reported.
    await eventually(() => {
      const chair = host.getSnapshot().seats.find((s) => s.seat === 1)!;
      expect(chair.connected).toBe(false);
      expect(chair.bot).toBe(false);
      expect(chair.away).toBe(true);
      expect(host.getSnapshot().security.waitingOn?.seat).toBe(1);
      expect(host.getSnapshot().security.paused).toContain('Guesty');
    }, 10_000);

    // 3. The walkover lands once the grace runs out — promptly, not minutes.
    await eventually(() => {
      expect(host.getSnapshot().session?.result?.reason).toBe('opponent-left');
      expect(host.getSnapshot().session?.result?.winner).toBe(0);
    }, 10_000);
    const tookMs = Date.now() - crashedAt;
    expect(tookMs, `walkover took ${tookMs} ms`).toBeLessThan(
      heartbeat.heartbeatTimeoutMs + graceMs + 5_000,
    );

    // 4. Play again: the room survives its walkover as a lobby on the same code.
    await host.rematch();
    const lobby = host.getSnapshot();
    expect(lobby.stage).toBe('lobby');
    expect(lobby.room?.code).toBe(room.code);
    expect(lobby.error).toBeNull();
    expect(lobby.seats.map((s) => s.profileId)).toEqual(['reopen-host']);

    // 5. Somebody new joins the same code, and the next match deals and plays.
    const newcomer = seat('reopen-newcomer', 'Nova');
    await newcomer.join(room.code);
    await eventually(() => {
      expect(newcomer.getSnapshot().localSeat).toBe(1);
      expect(newcomer.getSnapshot().stage).toBe('lobby');
      expect(host.getSnapshot().seats.filter((s) => s.connected)).toHaveLength(2);
    }, 10_000);

    await host.start();
    await eventually(() => {
      const h = host.getSnapshot();
      const n = newcomer.getSnapshot();
      expect(
        n.stage,
        `host stage=${h.stage} err=${h.error} deal=${h.dealFault} sec=${h.security.tier}/${JSON.stringify(h.security.ceremony)} | newcomer err=${n.error} deal=${n.dealFault} seats=${JSON.stringify(n.seats.map((x) => x.profileId))}`,
      ).toBe('table');
    }, 20_000);
    expect(host.getSnapshot().security.tier).toBe('veil');

    const before = host.getSnapshot().session!.log.length;
    await eventually(() => {
      stepActor(host, 'wildpile', rng, report);
      stepActor(newcomer, 'wildpile', rng, report);
      expect(host.getSnapshot().session!.log.length).toBeGreaterThan(before + 3);
    }, 30_000);
    await eventually(() => {
      expect(newcomer.getSnapshot().session!.lastAppliedHash).toBe(
        host.getSnapshot().session!.lastAppliedHash,
      );
    }, 10_000);
    expect(report.errors, report.errors.join('\n')).toEqual([]);
  }, 150_000);
});
