import { runBalanceGates } from '../sim/gates';

interface CliArgs {
  games: number;
  seed: number;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let games = 500;
  let seed = 20260824;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--games') games = Number(argv[++index]);
    else if (arg === '--seed') seed = Number(argv[++index]);
  }
  if (!Number.isInteger(games) || games <= 0) throw new Error('--games must be a positive integer');
  return { games, seed };
}

const { games, seed } = parseArgs(process.argv.slice(2));
console.log(`cribbage balance gates — ${games} games per phase, base seed ${seed}\n`);
const report = runBalanceGates({ games, baseSeed: seed });

console.log('head-to-head (hard vs easy, seats alternating)');
console.log(
  `  hard ${(report.headToHead.hardWinRate * 100).toFixed(1)}%  easy ${(
    report.headToHead.easyWinRate * 100
  ).toFixed(1)}%  → ${report.headToHead.passes ? 'PASS' : 'FAIL'}\n`,
);

console.log('persona round-robin');
for (const row of report.personas.rows) {
  console.log(`  ${row.key.padEnd(16)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)`);
}
for (const failure of report.personas.failures) console.log(`  ✗ ${failure}`);
console.log(`  → ${report.personas.passes ? 'PASS' : 'FAIL'}\n`);

console.log(`stalls: ${report.stalls}`);
console.log(report.passed ? '\nALL GATES PASS' : '\nGATES FAILED');
process.exitCode = report.passed ? 0 : 1;
