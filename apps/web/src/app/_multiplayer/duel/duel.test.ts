import { simGames } from '@parlour/engine/sim';
import { wildpileConfig } from '@parlour/game-wildpile';
import { blitzConfigSchema } from '@parlour/game-blitz';
import { afterEach, describe, expect, it } from 'vitest';
import { clearActiveMultiplayerSession } from '../roomSession';
import { runDuel, type DuelReport } from './harness';

/**
 * Two-player duels over the simulated network: full production clients, real
 * veil ceremony, latency-scheduled traffic, seats that act only through what
 * their table screens can express. See harness.ts.
 *
 * The PR lane plays a handful of seeded duels per game; the nightly full-sim
 * lane (PARLOUR_FULL_SIM=1) sweeps seeds and latency profiles. Every duel is
 * reproducible from its seed.
 */

const WILD_CONFIG = wildpileConfig.resolve({
  handSize: 5,
  turnTimeSeconds: 5,
  matchTimeMinutes: 2,
});
const BLITZ_CONFIG = blitzConfigSchema.resolve({});

function expectClean(report: DuelReport): void {
  const summary = [
    `outcome=${report.outcome} plies=${report.plies} in ${report.durationMs} ms`,
    `clockRescues=${report.clockRescues} staleTaps=${report.staleTaps}`,
    ...report.violations,
    ...(report.diagnostic ? [report.diagnostic] : []),
  ].join('\n');
  expect(report.violations, summary).toEqual([]);
  expect(['completed', 'walkover'], summary).toContain(report.outcome);
}

describe('fast two-player veiled duels', () => {
  afterEach(() => {
    clearActiveMultiplayerSession();
  });

  it('plays a veiled Wild duel to completion over a jittery link', async () => {
    const report = await runDuel({ gameId: 'wildpile', seed: 101, config: WILD_CONFIG });
    expectClean(report);
    // A rescue means a seat sat out a full turn clock — on an all-actor table
    // that is a wedge the clock papered over, and it deserves eyes.
    expect(report.clockRescues, `clock rescued the table ${report.clockRescues}×`).toBe(0);
  }, 150_000);

  it('plays a veiled Blitz duel to completion over a jittery link', async () => {
    const report = await runDuel({ gameId: 'blitz', seed: 202, config: BLITZ_CONFIG });
    expectClean(report);
  }, 150_000);

  it('awards the walkover when the Wild opponent’s device dies mid-match', async () => {
    const report = await runDuel({
      gameId: 'wildpile',
      seed: 303,
      config: WILD_CONFIG,
      fault: { kind: 'guest-crash', afterPlies: 6 },
    });
    expectClean(report);
    expect(report.outcome).toBe('walkover');
  }, 150_000);

  it('awards the walkover when the Blitz opponent’s device dies mid-round', async () => {
    const report = await runDuel({
      gameId: 'blitz',
      seed: 404,
      config: BLITZ_CONFIG,
      fault: { kind: 'guest-crash', afterPlies: 4 },
    });
    expectClean(report);
    expect(report.outcome).toBe('walkover');
  }, 150_000);

  it('hands the table to the guest and awards the walkover when the HOST dies', async () => {
    const report = await runDuel({
      gameId: 'blitz',
      seed: 606,
      config: BLITZ_CONFIG,
      fault: { kind: 'host-crash', afterPlies: 4 },
    });
    expectClean(report);
    expect(report.outcome).toBe('walkover');
  }, 150_000);

  it('hands a Wild table to the guest when the HOST dies mid-match', async () => {
    const report = await runDuel({
      gameId: 'wildpile',
      seed: 707,
      config: WILD_CONFIG,
      fault: { kind: 'host-crash', afterPlies: 6 },
    });
    expectClean(report);
    expect(report.outcome).toBe('walkover');
  }, 150_000);

  it('holds the seat for a Blitz player who quits and rejoins, then finishes', async () => {
    const report = await runDuel({
      gameId: 'blitz',
      seed: 505,
      config: BLITZ_CONFIG,
      fault: { kind: 'guest-quit-rejoin', afterPlies: 4, awayMs: 400 },
      reconnectGraceMs: 30_000,
    });
    expectClean(report);
    expect(report.outcome).toBe('completed');
  }, 150_000);

  it('sweeps seeds across both games (scaled by PARLOUR_FULL_SIM)', async () => {
    const perGame = simGames(2, 12);
    const failures: string[] = [];
    for (const gameId of ['wildpile', 'blitz'] as const) {
      for (let run = 0; run < perGame; run++) {
        const seed = 1_000 + run * 17 + (gameId === 'blitz' ? 7 : 0);
        const report = await runDuel({
          gameId,
          seed,
          config: gameId === 'wildpile' ? WILD_CONFIG : BLITZ_CONFIG,
          // Sweep the schedule space: every third run is a fast LAN, the rest
          // a sloppy WAN with signalling slower than data — the inversion that
          // shakes out ordering assumptions between the two paths.
          dataLatency: run % 3 === 0 ? { minMs: 0, maxMs: 2 } : { minMs: 2, maxMs: 18 },
          signalLatency: run % 3 === 0 ? { minMs: 0, maxMs: 2 } : { minMs: 5, maxMs: 25 },
          chaos: run % 2 === 0 ? 0.1 : 0.35,
        });
        if (
          report.violations.length > 0 ||
          !['completed', 'walkover'].includes(report.outcome) ||
          report.clockRescues > 0
        ) {
          failures.push(
            `${gameId} seed=${seed}: outcome=${report.outcome} rescues=${report.clockRescues}\n${report.violations.join('\n')}\n${report.diagnostic ?? ''}`,
          );
        }
        clearActiveMultiplayerSession();
      }
    }
    expect(failures, failures.join('\n\n')).toEqual([]);
  }, 1_800_000);
});
