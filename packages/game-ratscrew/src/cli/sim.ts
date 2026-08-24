import { aggregateWinRates, simulateGames } from '@parlour/engine';
import { ratscrewGame } from '../game';

/**
 * Headless Ratscrew bot simulator: `pnpm sim -- --games 1000` plays house
 * bots vs bots across rotating seat orders and reports win distribution.
 * Exit code 0 unless a match stalls (which is a flow bug, not a balance one).
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 1000;
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
const policy = ratscrewGame.bots[0];
if (!policy) throw new Error('ratscrew ships no bot policy');

console.log(`parlour ${ratscrewGame.id} bot simulation — ${args.games} games`);

const t0 = Date.now();
const records = simulateGames(ratscrewGame, args.games, {
  baseSeed: args.seed ?? 20260823,
  maxEvents: 20_000,
  tolerateStalls: true,
  seatPoliciesFor: () => [policy, policy, policy, policy],
  seatLabelsFor: () => ['house', 'house', 'house', 'house'],
});
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

const stalled = records.filter((record) => record.stalled).length;
const events = records.reduce((sum, record) => sum + record.events, 0) / records.length;

console.log('');
for (const row of aggregateWinRates(records, (_record, seat) => `seat ${seat}`)) {
  console.log(`  ${row.key.padEnd(8)} ${(row.winRate * 100).toFixed(1)}% over ${row.games} games`);
}
console.log('');
console.log(
  `avg ${events.toFixed(0)} events/game${stalled > 0 ? ` · ${stalled} STALLED` : ''} — done in ${seconds}s`,
);
process.exit(stalled > 0 ? 1 : 0);
