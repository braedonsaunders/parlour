import { runBotGame } from '@parlour/engine';
import { ohhellConfig, type OhHellRules } from '../config';
import { GAME_ID, createOhHellDef } from '../game';
import { TIER_BOTS } from '../bots';
import { DEFAULT_THRESHOLDS, runBalanceGates, type GateReport } from '../sim/gates';

/**
 * Headless Oh Hell bot simulator + seat-count/preset sweep:
 * `pnpm --filter @parlour/game-ohhell sim -- --games 120`
 */

interface Args {
  games: number;
  seed?: number;
}

function parseArgs(argv: readonly string[]): Args {
  let games = 100;
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

function printGates(report: GateReport): void {
  console.log('');
  console.log('gate 1 — Hard seats vs Easy seats');
  console.log(`  hard ${(report.headToHead.hardWinShare * 100).toFixed(1)}%`);
  console.log(`  easy ${(report.headToHead.easyWinShare * 100).toFixed(1)}%`);
  console.log(`  — ${report.headToHead.passes ? 'PASS' : 'FAIL'}`);

  console.log('');
  console.log('gate 2 — persona band');
  for (const row of report.personas.rows) {
    console.log(`  ${row.key.padEnd(10)} ${(row.winRate * 100).toFixed(1)}% (${row.games} games)`);
  }
  console.log(`  — ${report.personas.passes ? 'PASS' : 'FAIL'}`);

  console.log('');
  const shares = report.symmetry.shares.map((share) => `${(share * 100).toFixed(1)}%`).join(' / ');
  console.log(
    `gate 3 — symmetry seat shares ${shares} · spread ${((report.symmetry.spread ?? 1) * 100).toFixed(1)}% — ${
      report.symmetry.passes ? 'PASS' : 'FAIL'
    }`,
  );
}

const args = parseArgs(process.argv.slice(2));

console.log(`parlour ${GAME_ID} bot simulation — ${args.games} games per gate phase`);
console.log(
  `gates: Hard seats ≥ ${(DEFAULT_THRESHOLDS.headToHeadMin * 100).toFixed(0)}% · persona band ${(
    DEFAULT_THRESHOLDS.personaBandMin * 100
  ).toFixed(0)}–${(DEFAULT_THRESHOLDS.personaBandMax * 100).toFixed(0)}%`,
);

const t0 = Date.now();
const report = runBalanceGates({ games: args.games, baseSeed: args.seed });
printGates(report);

// Seat-count × preset sweep: every combination must finish with a ranked
// result and zero stalls. runBotGame throws loudly on illegal moves and
// BotGameStalledError otherwise, so reaching the summary means a clean matrix.
const SEAT_COUNTS = [3, 4, 5, 6, 7];
const PRESETS: readonly { id: string; values: Partial<OhHellRules> }[] = [
  { id: 'classic', values: {} },
  { id: 'quick', values: { handArc: 'down', maxHand: 5 } },
  { id: 'wizard', values: { wizards: true } },
];

const def = createOhHellDef();
const sweepPerCombo = Math.max(24, Math.ceil(args.games / 3));
let sweepGames = 0;
let sweepEvents = 0;

for (const preset of PRESETS) {
  const config = ohhellConfig.resolve(preset.values);
  for (const seats of SEAT_COUNTS) {
    for (let i = 0; i < sweepPerCombo; i++) {
      // cycle tiers so no seat position owns one strength across the sweep
      const policies = Array.from(
        { length: seats },
        (_, seat) => TIER_BOTS[(i + seat) % TIER_BOTS.length]!,
      );
      const record = runBotGame(def, {
        seed: (((args.seed ?? 20_260_824) ^ (seats * 7919)) + i * 104729) | 0,
        config,
        policies,
        maxEvents: 8_000,
      });
      sweepGames += 1;
      sweepEvents += record.events;
    }
  }
}

const seconds = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log(
  `sweep: ${sweepGames} games across ${SEAT_COUNTS.length} seat counts × ${PRESETS.length} presets · ` +
    `${sweepEvents} events · 0 stalls · 0 illegal-move throws`,
);
if (report.stalls > 0) console.log(`(${report.stalls} stalled gate games)`);
console.log('');
console.log(
  `${report.passed && report.stalls === 0 ? 'ALL GATES PASS' : 'GATES FAILED'} in ${seconds}s`,
);
process.exit(report.passed && report.stalls === 0 ? 0 : 1);
