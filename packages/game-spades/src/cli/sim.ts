import { GAME_ID } from '../index';
import { DEFAULT_THRESHOLDS, runBalanceGates } from '../sim/gates';

/**
 * Headless Spades bot simulator:
 * `pnpm --filter @parlour/game-spades sim -- --games 200`
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

console.log(`parlour ${GAME_ID} bot simulation — ${args.games} games per phase`);
console.log(
  `gates: Hard ≥ ${(DEFAULT_THRESHOLDS.headToHeadMin * 100).toFixed(0)}% · persona band ${(
    DEFAULT_THRESHOLDS.personaBandMin * 100
  ).toFixed(0)}–${(DEFAULT_THRESHOLDS.personaBandMax * 100).toFixed(0)}%`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

console.log('');
console.log('gate 1 — Hard partnership vs Easy partnership');
console.log(`  hard ${(report.headToHead.hardWinRate * 100).toFixed(1)}%`);
console.log(`  easy ${(report.headToHead.easyWinRate * 100).toFixed(1)}%`);
console.log(`  — ${report.headToHead.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('gate 2 — persona band');
for (const row of report.personas.rows) {
  console.log(`  ${row.key.padEnd(10)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)`);
}
console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log(
  `gate 3 — symmetry team0 ${(report.symmetry.teamZeroShare === null
    ? 'n/a'
    : `${(report.symmetry.teamZeroShare * 100).toFixed(1)}%`
  )} — ${report.symmetry.passes ? 'PASS' : 'FAIL'}`,
);

if (report.stalls > 0) console.log(`(${report.stalls} stalled games)`);
console.log('');
console.log(`${report.passed ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`);
process.exit(report.passed ? 0 : 1);
