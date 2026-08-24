import { GAME_ID } from '../index';
import { DEFAULT_THRESHOLDS, runBalanceGates } from '../sim/gates';

/**
 * Headless Ratscrew persona simulator: `pnpm sim -- --games 500` plays
 * reaction-time bots vs bots on a virtual match clock and enforces the
 * balance gates. Exit code 0 = all gates pass.
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 500;
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
  `gates: bolt ≥ ${(DEFAULT_THRESHOLDS.headToHeadMin * 100).toFixed(0)}% vs rusty · persona band ` +
    `${(DEFAULT_THRESHOLDS.personaBandMin * 100).toFixed(0)}–${(DEFAULT_THRESHOLDS.personaBandMax * 100).toFixed(0)}% · seeded replay`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

console.log('');
console.log('gate 1 — Bolt vs Rusty head-to-head (seats alternate)');
console.log(
  `  bolt ${(report.headToHead.hardWinRate * 100).toFixed(1)}% vs rusty ${(report.headToHead.easyWinRate * 100).toFixed(1)}%` +
    ` over ${report.headToHead.games} games — ${report.headToHead.passes ? 'PASS' : 'FAIL'}`,
);

console.log('');
console.log('gate 2 — persona win-rate band in 4-seat mixed games');
for (const row of report.personas.rows) {
  const flag =
    row.winRate < report.thresholds.personaBandMin || row.winRate > report.thresholds.personaBandMax
      ? ' ✗'
      : '';
  console.log(
    `  ${row.key.padEnd(8)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)${flag}`,
  );
}
console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log(
  `gate 3 — determinism: ${report.determinism.samples} sampled matches replay hash-identically — ${
    report.determinism.passes ? 'PASS' : 'FAIL'
  }`,
);

if (report.stalls > 0) console.log(`(${report.stalls} stalled matches)`);
console.log('');
console.log(`avg ${report.avgEvents.toFixed(0)} authority events per game`);
console.log(`${report.passed ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`);
process.exit(report.passed ? 0 : 1);
