import { GAME_ID } from '../index';
import { DEFAULT_THRESHOLDS, runBalanceGates } from '../sim/gates';

/**
 * Headless euchre bot simulator: `pnpm --filter @parlour/game-euchre sim -- --games 2000`
 * plays partnerships of bots vs bots and enforces the balance gates.
 * Exit code 0 = gates pass.
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 2_000;
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

console.log(`parlour ${GAME_ID} bot simulation — ${args.games} matches per phase`);
console.log(
  `gates: hard ≥ ${(DEFAULT_THRESHOLDS.headToHeadMin * 100).toFixed(0)}% vs easy · persona band ` +
    `${(DEFAULT_THRESHOLDS.personaBandMin * 100).toFixed(0)}–${(DEFAULT_THRESHOLDS.personaBandMax * 100).toFixed(0)}% · symmetry ` +
    `${(DEFAULT_THRESHOLDS.symmetryBandMin * 100).toFixed(0)}–${(DEFAULT_THRESHOLDS.symmetryBandMax * 100).toFixed(0)}%`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

console.log('');
console.log('gate 1 — Hard partnership vs Easy partnership (halves alternate)');
console.log(
  `  hard ${(report.headToHead.hardWinRate * 100).toFixed(1)}% vs easy ${(report.headToHead.easyWinRate * 100).toFixed(1)}%` +
    ` over ${report.headToHead.games} matches — ${report.headToHead.passes ? 'PASS' : 'FAIL'}`,
);

console.log('');
console.log('gate 2 — persona win-credit band in mixed-persona matches');
for (const row of report.personas.rows) {
  const flag =
    row.winRate < report.thresholds.personaBandMin || row.winRate > report.thresholds.personaBandMax
      ? ' ✗'
      : '';
  console.log(`  ${row.key.padEnd(8)} ${(row.winRate * 100).toFixed(1)}% (${row.games})${flag}`);
}
console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('gate 3 — identical-policy team symmetry');
console.log(
  `  team 0 share ${
    report.symmetry.teamZeroShare === null ? 'n/a' : `${(report.symmetry.teamZeroShare * 100).toFixed(1)}%`
  } over ${report.symmetry.games} matches — ${report.symmetry.passes ? 'PASS' : 'FAIL'}`,
);

if (report.stalls > 0) console.log(`\n(${report.stalls} abandoned matches)`);

console.log('');
console.log(`${report.passed ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`);
process.exit(report.passed ? 0 : 1);
