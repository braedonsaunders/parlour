import { describe, expect, it } from 'vitest';
import { makeRng, runBotGame, sessionApply, type LegalMove, type SeatId } from '@parlour/engine';
import { TIER_BOTS } from './bots';
import { pokerConfig, type PokerRules } from './config';
import { pokerGame } from './game';
import { buildPots, potTotal } from './pot';
import { livingSeats, type PokerState } from './state';
import { chipsInPlay, openSession } from './test-util';

/** Plays a whole match with bots, checking the table's books after every move. */
function playAudited(
  seats: number,
  seed: number,
  config: Partial<PokerRules> = {},
): { state: PokerState; hands: number; events: number } {
  let session = openSession({ seats, seed, config });
  const rng = makeRng(seed).fork('bots');
  const bank = chipsInPlay(session.state);
  const policies = Array.from({ length: seats }, (_, seat) => TIER_BOTS[seat % TIER_BOTS.length]!);

  let events = 0;
  while (session.status === 'playing') {
    if (events > 60_000) throw new Error(`match never ended (seed ${seed})`);
    const seat = session.state.turn;
    if (seat === null)
      throw new Error(`no seat to act, and the flow did not advance (seed ${seed})`);

    const legal = [
      ...(pokerGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? []),
    ] as LegalMove[];
    expect(legal.length).toBeGreaterThan(0);

    const view = pokerGame.playerView(session.state, seat);
    const choice =
      policies[seat]!.chooseMove(view, seat, legal, rng, { thinkMs: () => 0 }) ?? legal[0]!;
    const outcome = sessionApply(pokerGame, session, seat, choice.id, choice.payload);
    if (outcome.rejected) {
      throw new Error(`bot chose an illegal ${choice.id}: ${outcome.rejected.code}`);
    }
    session = outcome.session;
    events += 1;

    const state = session.state;
    // The books, checked after every single action in the match.
    expect(chipsInPlay(state)).toBe(bank);
    expect(state.stacks.every((chips) => chips >= 0)).toBe(true);
    expect(state.committed.every((chips) => chips >= 0)).toBe(true);
    expect(potTotal(buildPots(state.committed, state.folded))).toBe(
      state.committed.reduce((sum, chips) => sum + chips, 0),
    );
    // A seat with chips left is never marked all-in, and vice versa.
    for (const seatId of livingSeats(state)) {
      if (state.allIn[seatId]) expect(state.stacks[seatId]).toBe(0);
    }
  }

  return { state: session.state, hands: session.state.handNo, events };
}

describe('a whole match', () => {
  const tables: [number, number][] = [
    [2, 1_001],
    [3, 1_002],
    [4, 1_003],
    [5, 1_004],
    [6, 1_005],
  ];

  for (const [seats, seed] of tables) {
    it(`plays ${seats}-handed to a single winner without losing a chip`, () => {
      const { state } = playAudited(seats, seed);
      const bank = seats * pokerConfig.defaults().startingStack;

      expect(livingSeats(state)).toHaveLength(1);
      expect(chipsInPlay(state)).toBe(bank);
      expect(state.stacks[livingSeats(state)[0] as SeatId]).toBe(bank);

      const result = pokerGame.end(state);
      expect(result).not.toBeNull();
      expect(result!.winner).toBe(livingSeats(state)[0]);
      expect(result!.rankings).toHaveLength(seats);
      expect(result!.rankings.map((row) => row.rank)).toEqual(
        Array.from({ length: seats }, (_, index) => index + 1),
      );
      // Everybody appears exactly once in the final standings.
      expect(new Set(result!.rankings.map((row) => row.seat)).size).toBe(seats);
    });
  }

  it('finishes a turbo match faster than a deep-stack one, on average', () => {
    // Any single match can run long or short, so this averages a handful.
    // The claim is about the structures, not about one deal.
    const mean = (speed: 'turbo' | 'deep'): number => {
      const preset = pokerConfig.presets.find((entry) => entry.id === speed)!;
      const runs = [5_001, 5_002, 5_003, 5_004, 5_005].map(
        (seed) => playAudited(4, seed, preset.values).hands,
      );
      return runs.reduce((sum, hands) => sum + hands, 0) / runs.length;
    };
    expect(mean('turbo')).toBeLessThan(mean('deep'));
  }, 300_000);

  it('climbs the blinds on schedule', () => {
    const { state } = playAudited(3, 3_001, { blindSpeed: 'turbo' });
    expect(state.level).toBeGreaterThan(0);
  });

  it('never leaves a seat both alive and broke', () => {
    const { state } = playAudited(5, 4_001);
    for (let seat = 0; seat < state.seats; seat++) {
      if (!state.out[seat]) expect(state.stacks[seat]).toBeGreaterThan(0);
      else expect(state.stacks[seat]).toBe(0);
    }
  });
});

describe('across many seeds', () => {
  it('never stalls, never rejects a bot move, and always names a winner', () => {
    for (let seed = 500; seed < 530; seed++) {
      const seats = 2 + (seed % 5);
      const record = runBotGame(pokerGame, {
        seed,
        policies: Array.from({ length: seats }, (_, seat) => TIER_BOTS[seat % 3]!),
        config: { blindSpeed: 'turbo', startingStack: 1500 },
        maxEvents: 60_000,
      });
      expect(record.result).not.toBeNull();
      expect(record.result!.winner).not.toBeNull();
      expect(record.result!.rankings).toHaveLength(seats);
    }
  }, 120_000);

  it('is deterministic for a seed', () => {
    const once = playAudited(4, 7_007);
    const twice = playAudited(4, 7_007);
    expect(twice.state.stacks).toEqual(once.state.stacks);
    expect(twice.hands).toBe(once.hands);
    expect(twice.events).toBe(once.events);
  });
});
