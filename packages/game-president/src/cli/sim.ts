import { GAME_ID } from '../game';
import { DEFAULT_THRESHOLDS, runBalanceGates } from '../sim/gates';

/**
 * Headless President bot simulator: `pnpm --filter @parlour/game-president sim`
 * plays bot-vs-bot matches and enforces the balance gates. Exit 0 = pass.
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 400;
  let seed: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue; // pnpm inserts a bare -- when forwarding args
    if (arg === '--games') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) {
        fail(`--games must be a positive integer, got ${String(argv[i])}`);
      }
      games = value;
    } else if (arg === '--seed') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value)) {
        fail(`--seed must be an integer, got ${String(argv[i])}`);
      }
      seed = value;
    } else {
      fail(`unknown argument: ${String(arg)} (usage: sim [--games N] [--seed N])`);
    }
  }
  return { games, seed };
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));

console.log(`parlour ${GAME_ID} bot simulation — ${args.games} games per gate`);
console.log(
  `gates: Sharp above Rookie ≥ ${(DEFAULT_THRESHOLDS.ladderMin * 100).toFixed(0)}% · ` +
    `win bands ${(DEFAULT_THRESHOLDS.socialBandMin * 100).toFixed(0)}–${(DEFAULT_THRESHOLDS.sharpWinMax * 100).toFixed(0)}% · ` +
    `≤${DEFAULT_THRESHOLDS.maxAverageDeals} deals/match`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

console.log('');
console.log('gate 1 — skill ladder (Sharp vs Rookie, seating rotated)');
console.log(
  `  Sharp above Rookie ${(report.ladder.sharpAboveRookieRate * 100).toFixed(1)}% · ` +
    `wins ${(report.ladder.sharpWinRate * 100 || 0).toFixed(1)}% vs Rookie ${(report.ladder.rookieWinRate * 100 || 0).toFixed(1)}%` +
    ` over ${report.ladder.games} games — ${report.ladder.passes ? 'PASS' : 'FAIL'}`,
);

console.log('');
console.log('gate 2 — persona win-rate band in mixed tables');
for (const row of report.personas.rows) {
  const flag = row.winRate > report.thresholds.sharpWinMax ? ' ✗' : '';
  console.log(
    `  ${row.label.padEnd(10)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)${flag}`,
  );
}
console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('gate 3 — pacing');
console.log(
  `  avg ${report.pace.averageDeals.toFixed(2)} deals/match (max seen ${report.pace.maxDealsSeen}) — ${report.pace.passes ? 'PASS' : 'FAIL'}`,
);

console.log('');
console.log(`${report.passed ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`);
process.exit(report.passed ? 0 : 1);
