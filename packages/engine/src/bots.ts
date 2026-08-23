import { makeRng } from './rng';
import { createSession, sessionApply } from './runtime';
import type {
  BotPolicy,
  GameDef,
  GameSession,
  LegalMove,
  MatchResult,
  Rng,
  RuleValues,
  SeatId,
} from './types';

// ---------------------------------------------------------------------------
// Bot harness (spec §4.1/§9): bots are engine clients — enumerate legal moves,
// ask a BotPolicy to choose one, apply it through the normal session runtime.
// ---------------------------------------------------------------------------

export function enumerateLegalMoves<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
): readonly LegalMove[] {
  return def.flow.legalMoves(session.state, session.phase);
}

export function chooseBotMove<S>(
  policy: BotPolicy<S>,
  view: S,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
): LegalMove | null {
  return policy.chooseMove(view, seat, legal, rng, { thinkMs: () => 0 });
}

/** Per-seat policy slots; a missing policy for an acting seat is a hard error. */
export type SeatPolicies<S> = readonly (BotPolicy<S> | undefined)[];

export interface BotGameOptions<S, C extends RuleValues> {
  seed: number;
  policies: SeatPolicies<S>;
  config?: Partial<C>;
  /** hard stop against stuck games — exceeded means a flow/move bug */
  maxEvents?: number;
}

export interface BotGameRecord {
  seed: number;
  seats: number;
  events: number;
  result: MatchResult | null;
}

const DEFAULT_MAX_EVENTS = 10_000;

function samePayload(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Plays one full match headless, every acting seat driven by its policy.
 * Deterministic for a given seed + policies. Fails closed: a policy choosing
 * an illegal move, or a game that never ends, throws instead of guessing.
 */
export function runBotGame<S, C extends RuleValues>(
  def: GameDef<S, C>,
  opts: BotGameOptions<S, C>,
): BotGameRecord {
  const seats = opts.policies.length;
  if (seats < 1) throw new Error('runBotGame: at least one seat is required');
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS;

  const config = def.configSchema.resolve(opts.config ?? {});
  let session = createSession(def, { seed: opts.seed, config, seats });
  const rng = makeRng(opts.seed).fork('bots');
  let applied = 0;

  while (session.status === 'playing') {
    if (applied >= maxEvents) {
      throw new Error(
        `runBotGame: exceeded ${maxEvents} events without ending (seed ${opts.seed})`,
      );
    }

    const actor = session.phase.actor;
    if (actor === null) throw new Error(`runBotGame: stalled flow — no acting seat (seed ${opts.seed})`);

    const policy = opts.policies[actor];
    if (!policy) throw new Error(`runBotGame: no bot policy seated at ${actor}`);

    const legal = def.flow.legalMoves(session.state, session.phase);
    if (legal.length === 0) {
      throw new Error(`runBotGame: seat ${actor} has no legal moves (seed ${opts.seed})`);
    }

    const view = def.playerView(session.state, actor);
    let choice = policy.chooseMove(view, actor, legal, rng, { thinkMs: () => 0 });
    choice ??= legal[0] as LegalMove;

    const target =
      legal.find((m) => m.id === choice.id && samePayload(m.payload, choice.payload)) ??
      legal.find((m) => m.id === choice.id) ??
      choice;

    const outcome = sessionApply(def, session, actor, target.id, target.payload);
    if (outcome.rejected) {
      throw new Error(
        `runBotGame: ${policy.id} chose illegal move "${target.id}" at seq ${session.log.length}: ` +
          `${outcome.rejected.code} (${outcome.rejected.message})`,
      );
    }
    session = outcome.session;
    applied += 1;
  }

  return { seed: opts.seed, seats, events: session.log.length, result: session.result };
}

// ---------------------------------------------------------------------------
// Batch simulation + win-rate aggregation (balance gates are built on this)
// ---------------------------------------------------------------------------

export interface SimulationRecord extends BotGameRecord {
  /** seats ranked 1st after any tie/penalty rules — may share the rank */
  winners: readonly SeatId[];
}

export interface SimulateOptions<S, C extends RuleValues> extends Omit<
  BotGameOptions<S, C>,
  'seed' | 'policies'
> {
  baseSeed: number;
  /** builds the seated policies for each game index; must be deterministic */
  seatPoliciesFor: (gameIndex: number) => SeatPolicies<S>;
}

export function simulateGames<S, C extends RuleValues>(
  def: GameDef<S, C>,
  games: number,
  opts: SimulateOptions<S, C>,
): SimulationRecord[] {
  if (!Number.isInteger(games) || games < 0) {
    throw new Error(`simulateGames: games must be a non-negative integer, got ${games}`);
  }
  const records: SimulationRecord[] = [];
  for (let i = 0; i < games; i++) {
    const seed = (opts.baseSeed + i) | 0;
    const record = runBotGame(def, { ...opts, seed, policies: opts.seatPoliciesFor(i) });
    records.push({ ...record, winners: winnersOf(record.result) });
  }
  return records;
}

function winnersOf(result: MatchResult | null): readonly SeatId[] {
  if (!result) return [];
  return result.rankings.filter((r) => r.rank === 1).map((r) => r.seat);
}

export interface WinRateRow {
  key: string;
  games: number;
  /** fractional wins — tied winners split the credit so rows sum to game count */
  credits: number;
  winRate: number;
}

/**
 * Aggregates per-label win rates over simulated games. `labelFor` names the
 * policy seated at each seat of a record; every seated label accrues one game.
 */
export function aggregateWinRates(
  records: readonly SimulationRecord[],
  labelFor: (record: SimulationRecord, seat: SeatId) => string,
): WinRateRow[] {
  const rows = new Map<string, { games: number; credits: number }>();
  for (const record of records) {
    const counted = new Set<string>();
    for (let seat = 0; seat < record.seats; seat++) {
      const key = labelFor(record, seat);
      const row = rows.get(key) ?? { games: 0, credits: 0 };
      row.games += counted.has(key) ? 0 : 1;
      counted.add(key);
      if (record.winners.includes(seat)) {
        row.credits += 1 / Math.max(1, record.winners.length);
      }
      rows.set(key, row);
    }
  }
  return [...rows.entries()]
    .map(([key, row]) => ({ key, games: row.games, credits: row.credits, winRate: row.games > 0 ? row.credits / row.games : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
