import { isVeilHandle } from '@parlour/engine';
import { isFullSim, isSlowLane, simMs } from '@parlour/engine/sim';
import { wildpileConfig, wildpileFace } from '@parlour/game-wildpile';
import { afterEach, describe, expect, it } from 'vitest';
import { clearActiveMultiplayerSession } from '../roomSession';
import { runDuel, type DuelReport } from './harness';

/**
 * Complicated Wild: the duel harness under the FULL rule surface, with proof.
 *
 * A clean duel under default rules says nothing about stacked Draw Fours,
 * jump-ins, seven-zero swaps, swap wilds, forced play, draw-to-match, or the
 * two clocks — so this suite turns every house rule on, drives the clocks for
 * real, and then ASSERTS coverage from the applied log: which moves ran,
 * which card kinds hit the table. Coverage that is not measured is a hope.
 *
 * It is also the slowest lane in the repo: measured at 332s for three tests,
 * because every duel runs until a real two-minute match clock expires. That is
 * not a cost worth paying on every pull request, so the whole file is opt-in
 * behind PARLOUR_SLOW_LANES=1 and runs on push instead — see `isSlowLane`.
 * `duel.test.ts` and `reopen.test.ts` cover the same harness in the PR lane in
 * under a minute, including walkovers, host migration and rejoin.
 *
 * Full sample (PARLOUR_FULL_SIM=1) additionally loops seeds until every
 * expressible move and every card kind in the 114-card house deck has been
 * witnessed, and fails naming whatever never appeared.
 */

/**
 * Every house rule on, the full 114-card deck.
 *
 * The match clock is what ends a grindy draw-to-match marathon, so it sets the
 * floor on how long a duel can run — and it is a real clock, so it is the only
 * lever on wall time. Quick mode takes it to the schema minimum of 2 minutes
 * (it is an `int` field with `min: 2`, so a fractional value is silently
 * clamped and buys nothing); full mode runs the longer soak.
 */
const HOUSE_CONFIG = wildpileConfig.resolve({
  handSize: 7,
  turnTimeSeconds: 5,
  matchTimeMinutes: simMs(2, 4),
  stackDrawTwo: true,
  stackDrawFour: true,
  jumpIn: true,
  drawToMatch: true,
  forcePlay: true,
  sevenZero: true,
  swapCards: true,
  challengeDrawFour: true,
});

/**
 * Budget for one duel, and the timeout the test declares for itself.
 *
 * The budget must stay comfortably above the match clock, or a duel that is
 * merely grindy gets reported as a budget exhaustion instead of finishing —
 * which is a false failure, and the whole reason this lane used to flake.
 */
const DUEL_BUDGET_MS = simMs(150_000, 300_000);
const DUEL_TIMEOUT_MS = simMs(200_000, 400_000);

/**
 * How many duels the coverage sweep may play before giving up.
 *
 * Hoisted because the test's own timeout is per-duel budget times the cap, and
 * a timeout computed from a value declared inside the test body would be
 * reading the constant it is meant to bound.
 */
const SWEEP_CAP = isFullSim() ? 24 : 4;

/** Moves a veiled Wild table can express (challengeDrawFour is veil-disabled). */
const ALL_MOVES = [
  'playCard',
  'draw',
  'chooseColor',
  'chooseTarget',
  'declineJump',
  'callLastCard',
] as const;

/** Every card kind in the house deck. */
const ALL_KINDS = [
  'number',
  'skip',
  'reverse',
  'draw-two',
  'discard-all',
  'wild',
  'wild-draw-four',
  'wild-swap',
  'wild-shuffle',
] as const;

/** What one duel's applied log actually exercised. */
function witnessed(report: DuelReport): { moves: Set<string>; kinds: Set<string> } {
  const moves = new Set(Object.keys(report.moveTally));
  const kinds = new Set<string>();
  const note = (card: unknown) => {
    if (typeof card !== 'string' || isVeilHandle(card)) return;
    try {
      kinds.add(wildpileFace(card).meta.kind);
    } catch {
      // not a wildpile card id — a handle that never resolved, already flagged
    }
  };
  for (const event of report.finalLog) {
    note((event.payload as { card?: unknown } | undefined)?.card);
    for (const [, face] of event.reveals ?? []) note(face);
  }
  return { moves, kinds };
}

function summarize(report: DuelReport): string {
  return [
    `outcome=${report.outcome} plies=${report.plies} in ${report.durationMs} ms`,
    `moves=${JSON.stringify(report.moveTally)}`,
    ...report.violations,
    ...(report.diagnostic ? [report.diagnostic] : []),
  ].join('\n');
}

describe.runIf(isSlowLane())('complicated Wild over the duel harness', () => {
  afterEach(() => {
    clearActiveMultiplayerSession();
  });

  it(
    'plays a full house-rules table cleanly — stacking, jump-in, sevens, swap wilds',
    async () => {
      const report = await runDuel({
        gameId: 'wildpile',
        seed: 9001,
        config: HOUSE_CONFIG,
        chaos: 0.35,
        // Past the match clock, so the clock — not the harness budget — is what
        // ends a grindy draw-to-match marathon.
        maxMs: DUEL_BUDGET_MS,
      });
      expect(report.violations, summarize(report)).toEqual([]);
      expect(['completed', 'walkover'], summarize(report)).toContain(report.outcome);
      // The challenge is information the veil refuses to price: with hands
      // sealed nobody can know a Draw Four was dishonest, so the move must
      // never enter a veiled log even with the house rule switched on.
      expect(report.moveTally['challengeDrawFour'] ?? 0).toBe(0);
    },
    DUEL_TIMEOUT_MS,
  );

  it(
    'runs both clocks for real: a slow seat is timed out, the timeouts replay cleanly',
    async () => {
      const report = await runDuel({
        gameId: 'wildpile',
        seed: 9100,
        config: HOUSE_CONFIG,
        // The guest is a phone left on a table: it acts so slowly the host's
        // turn clock must play for it, over and over. Convergence is asserted
        // by the harness, so every injected timeout also replayed identically
        // on the seat it was injected against.
        //
        // Deliberately NOT scaled: the guest has to be slower than the 5s turn
        // clock for that clock to fire, and this test exists to prove it does.
        // Shortening the pace would make the assertion vacuous.
        guestPaceMs: { minMs: 6_000, maxMs: 8_000 },
        maxMs: DUEL_BUDGET_MS,
        chaos: 0.2,
      });
      expect(report.violations, summarize(report)).toEqual([]);
      expect(['completed', 'walkover'], summarize(report)).toContain(report.outcome);
      expect(report.clockRescues, 'the turn clock never fired').toBeGreaterThan(0);
      expect(report.moveTally['timeout'] ?? 0, 'no timeout entered the log').toBeGreaterThan(0);
    },
    DUEL_TIMEOUT_MS,
  );

  it(
    'witnesses every move and card kind the house table can produce',
    async () => {
      const wantMoves = new Set<string>(
        isFullSim() ? ALL_MOVES : ['playCard', 'draw', 'chooseColor'],
      );
      const wantKinds = new Set<string>(isFullSim() ? ALL_KINDS : ['number', 'wild']);
      const seenMoves = new Set<string>();
      const seenKinds = new Set<string>();
      const failures: string[] = [];
      let ranAtLeastOneActionKind = false;

      for (let run = 0; run < SWEEP_CAP; run++) {
        const report = await runDuel({
          gameId: 'wildpile',
          seed: 9_200 + run * 31,
          config: HOUSE_CONFIG,
          chaos: run % 2 === 0 ? 0.25 : 0.5,
          dataLatency: run % 3 === 0 ? { minMs: 0, maxMs: 2 } : { minMs: 2, maxMs: 15 },
          maxMs: DUEL_BUDGET_MS,
        });
        clearActiveMultiplayerSession();
        if (report.violations.length > 0 || !['completed', 'walkover'].includes(report.outcome)) {
          failures.push(`seed=${report.seed}: ${summarize(report)}`);
          continue;
        }
        const { moves, kinds } = witnessed(report);
        for (const move of moves) seenMoves.add(move);
        for (const kind of kinds) seenKinds.add(kind);
        if (['skip', 'reverse', 'draw-two'].some((kind) => seenKinds.has(kind))) {
          ranAtLeastOneActionKind = true;
        }
        const movesDone = [...wantMoves].every((move) => seenMoves.has(move));
        const kindsDone = [...wantKinds].every((kind) => seenKinds.has(kind));
        if (movesDone && kindsDone && ranAtLeastOneActionKind) break;
      }

      expect(failures, failures.join('\n\n')).toEqual([]);
      const missingMoves = [...wantMoves].filter((move) => !seenMoves.has(move));
      const missingKinds = [...wantKinds].filter((kind) => !seenKinds.has(kind));
      const seen = `saw moves=${[...seenMoves].sort().join(',')} kinds=${[...seenKinds].sort().join(',')}`;
      expect(missingMoves, `moves never exercised (${seen})`).toEqual([]);
      expect(missingKinds, `card kinds never witnessed (${seen})`).toEqual([]);
      expect(ranAtLeastOneActionKind, `no action card ever hit the table (${seen})`).toBe(true);
      // Up to `cap` duels, so the budget is per-duel times the cap.
    },
    DUEL_TIMEOUT_MS * SWEEP_CAP,
  );
});
