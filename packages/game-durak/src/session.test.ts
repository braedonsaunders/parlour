import {
  applyPreset,
  chooseBotMove,
  createSession,
  makeRng,
  replaySession,
  sessionApply,
  stateHash,
  verifyLog,
  type GameSession,
  type SeatId,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { DURAK_BOTS, durakTierBot } from './bots';
import { rankOf, suitOf } from './cards';
import { durakConfig, type DurakRules } from './config';
import { createDurakDef } from './game';
import type { DurakState } from './state';

const def = createDurakDef({ bots: DURAK_BOTS });

type Live = GameSession<DurakState, DurakRules>;

function open(seats: number, config: Partial<DurakRules> = {}, seed = 20260827): Live {
  return createSession(def, { seed, config: durakConfig.resolve(config), seats });
}

/** Plays every acting seat with the given tier until the hand ends, or the guard trips. */
function playOut(session: Live, tier: 1 | 2 | 3 = 2, maxEvents = 6_000): Live {
  const policy = durakTierBot(tier);
  let live = session;
  let steps = 0;
  while (live.status === 'playing') {
    if (steps++ > maxEvents) throw new Error(`durak did not settle after ${maxEvents} events`);
    const actor = live.phase.actor;
    if (actor === null) throw new Error(`no actor in phase ${live.phase.phase}`);
    const legal = def.flow.legalMovesFor!(live.state, live.phase, actor);
    expect(legal.length, `seat ${actor} in ${live.phase.phase}`).toBeGreaterThan(0);
    const rng = makeRng(live.seed).fork(`ev:${live.log.length}`);
    const choice = chooseBotMove(policy, def.playerView(live.state, actor), actor, legal, rng);
    const outcome = sessionApply(def, live, actor as SeatId, choice!.id, choice!.payload);
    if (outcome.rejected) throw new Error(`${choice!.id}: ${outcome.rejected.message}`);
    live = outcome.session;
  }
  return live;
}

describe('the deal', () => {
  it('deals every seat six cards and turns up a trump under it', () => {
    for (const seats of [2, 3, 4, 5, 6]) {
      const live = open(seats);
      expect(live.state.hands).toHaveLength(seats);
      // A 36-card pack cannot deal six seats six cards each and still hold
      // back a trump — 6x6 is the whole deck — so a full table deals one
      // card thinner instead.
      const expectedHandSize = seats === 6 ? 5 : 6;
      for (const hand of live.state.hands) expect(hand).toHaveLength(expectedHandSize);
      expect(live.state.stock.at(-1)).toBe(live.state.trumpCard);
      expect(live.state.hands.flat().length + live.state.stock.length).toBe(36);
      expect(new Set([...live.state.hands.flat(), ...live.state.stock]).size).toBe(36);
      expect(live.setupFx?.some((event) => event.kind === 'card.flip')).toBe(true);
    }
  });

  it('gives the lead to the lowest trump in play, or to seat 0 if nobody has one', () => {
    for (const seed of [10, 55, 200, 900]) {
      const live = open(4, {}, seed);
      const trumps = live.state.hands.flatMap((hand, seat) =>
        hand
          .filter((card) => suitOf(card) === live.state.trumpSuit)
          .map((card) => ({ seat: seat as SeatId, rank: rankOf(card) })),
      );
      if (trumps.length === 0) {
        expect(live.state.attacker).toBe(0);
      } else {
        const lowest = trumps.reduce((best, current) =>
          current.rank < best.rank ? current : best,
        );
        expect(live.state.attacker).toBe(lowest.seat);
      }
    }
  });

  it('refuses a table it cannot seat', () => {
    expect(() => open(1)).toThrow(/requires 2–6 seats/);
    expect(() => open(7)).toThrow(/requires 2–6 seats/);
  });
});

describe('a whole hand', () => {
  it('reaches a decision under every preset', () => {
    for (const preset of ['classic', 'transfer', 'heads-up'] as const) {
      const config = applyPreset(durakConfig, preset);
      const seats = preset === 'heads-up' ? 2 : 4;
      const live = playOut(open(seats, config, 500 + seats), 2, 5_000);
      expect(live.status, preset).toBe('ended');
      expect(live.result, preset).not.toBeNull();
    }
  });

  it('never leaves an acting seat without a legal move, at any table size', () => {
    for (const seats of [2, 3, 5, 6]) {
      const live = playOut(open(seats, {}, 100 + seats), 3, 8_000);
      expect(live.status).toBe('ended');
    }
  });

  it('ranks the durak last and the rest by exit order', () => {
    const live = playOut(open(4, {}, 777), 2, 6_000);
    const result = live.result!;
    const ranks = result.rankings.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);
    const last = result.rankings.find((r) => r.rank === 4);
    if (result.reason === 'durak') {
      expect(last?.detail?.durak).toBe(true);
    }
  });
});

describe('replay', () => {
  it('reproduces the hand byte for byte from its log', () => {
    const played = playOut(open(3, {}, 991));
    const replayed = replaySession(def, played.seed, played.log, {
      config: played.config,
      seats: played.seats,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(played.state));
    expect(replayed.status).toBe('ended');
    expect(replayed.result).toEqual(played.result);
  });

  it('survives a hostile re-check of every player action', () => {
    const played = playOut(open(4, {}, 4242));
    expect(
      verifyLog(def, played.seed, played.log, { config: played.config, seats: played.seats }),
    ).toBeNull();
  });
});
