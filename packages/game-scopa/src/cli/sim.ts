import { GAME_ID } from '../index';
import { runCoverage } from '../sim/gates';
import { DEFAULT_THRESHOLDS, runBalanceGates } from '../sim/gates';

/**
 * Headless Scopa bot simulator:
 * `pnpm --filter @parlour/game-scopa sim -- --games 200`
 *
 * Runs the balance gates plus a coverage sweep across every supported seat
 * count (2/3/4/6) and rule preset. Any stall or illegal-move throw exits
 * non-zero.
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 200;
  let seed: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--games') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) fail(`--games must be a positive integer`);
      games = value;
    } else if (arg === '--seed') {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value)) fail(`--seed must be an integer`);
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

console.log(`parlour ${GAME_ID} bot simulation — ${args.games} games per gate phase`);
console.log(
  `gates: Hard ≥ ${(DEFAULT_THRESHOLDS.headToHeadMin * 100).toFixed(0)}% vs Easy · persona band ${(
    DEFAULT_THRESHOLDS.personaBandMin * 100
  ).toFixed(0)}–${(DEFAULT_THRESHOLDS.personaBandMax * 100).toFixed(0)}%`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });

console.log('');
console.log('gate 1 — Hard vs Easy heads-up');
console.log(`  hard ${(report.headToHead.hardWinRate * 100).toFixed(1)}%`);
console.log(`  easy ${(report.headToHead.easyWinRate * 100).toFixed(1)}%`);
console.log(`  — ${report.headToHead.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('gate 2 — persona band (4 seats, partnerships)');
for (const row of report.personas.rows) {
  console.log(`  ${row.key.padEnd(10)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)`);
}
console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log(
  `gate 3 — symmetry seat0 ${
    report.symmetry.seatZeroShare === null
      ? 'n/a'
      : `${(report.symmetry.seatZeroShare * 100).toFixed(1)}%`
  } — ${report.symmetry.passes ? 'PASS' : 'FAIL'}`,
);

// coverage sweep sized so gates + coverage clear 500 games together by default
const coverageRounds = Math.max(12, Math.ceil(args.games / 8));
const coverage = runCoverage({ rounds: coverageRounds, baseSeed: args.seed });

console.log('');
console.log('coverage — seats × presets');
for (const row of coverage.rows) {
  console.log(
    `  ${row.seats}p ${row.preset.padEnd(15)} ${String(row.ended).padStart(3)}/${row.games} ended` +
      (row.stalls > 0 ? ` (${row.stalls} STALLS)` : ''),
  );
}
console.log(
  `  — ${coverage.passed ? 'PASS' : 'FAIL'} (${coverage.games} games, ${coverage.stalls} stalls)`,
);

if (report.stalls > 0) console.log(`(${report.stalls} stalled gate games)`);
const seconds = ((Date.now() - t0) / 1000).toFixed(1);
const passed = report.passed && coverage.passed;
console.log('');
console.log(`${passed ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`);
process.exit(passed ? 0 : 1);
