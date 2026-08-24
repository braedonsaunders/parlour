import {
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
import { EIGHTS_BOTS, eightsTierBot } from './bots';
import { isWild, rankOf } from './cards';
import { eightsConfig, type EightsRules } from './config';
import { createEightsDef } from './game';
import type { EightsState } from './state';

const def = createEightsDef({ bots: EIGHTS_BOTS });

type Live = GameSession<EightsState, EightsRules>;

function open(seats: number, config: Partial<EightsRules> = {}, seed = 20260824): Live {
  return createSession(def, { seed, config: eightsConfig.resolve(config), seats });
}

/** Plays every seat with the given tier until the match ends, or the guard trips. */
function playOut(session: Live, tier: 1 | 2 | 3 = 2, maxEvents = 6_000): Live {
  const policy = eightsTierBot(tier);
  let live = session;
  let steps = 0;
  while (live.status === 'playing') {
    if (steps++ > maxEvents) throw new Error(`eights did not settle after ${maxEvents} events`);
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
  it('deals every seat its hand and turns up a card that is not an eight', () => {
    for (const seats of [2, 3, 4, 5, 6]) {
      const live = open(seats);
      const { round } = live.state;
      expect(round.hands).toHaveLength(seats);
      for (const hand of round.hands) expect(hand).toHaveLength(7);
      expect(round.discard).toHaveLength(1);
      expect(rankOf(round.discard[0]!)).not.toBe(8);
      expect(round.activeSuit).toBe(round.discard[0]!.slice(0, 1));
      // 52 cards, all accounted for.
      expect(round.hands.flat().length + round.stock.length + round.discard.length).toBe(52);
      expect(new Set([...round.hands.flat(), ...round.stock, ...round.discard]).size).toBe(52);
    }
  });

  it('starts the play left of the dealer and opens on the play phase', () => {
    const live = open(4);
    expect(live.state.dealer).toBe(0);
    expect(live.state.round.turn).toBe(1);
    expect(live.phase.phase).toBe('play');
    expect(live.phase.actor).toBe(1);
    expect(live.status).toBe('playing');
    expect(live.setupFx?.some((event) => event.kind === 'card.flip')).toBe(true);
  });

  it('refuses a table it cannot seat', () => {
    expect(() => open(1)).toThrow(/requires 2–6 seats/);
    expect(() => open(7)).toThrow(/requires 2–6 seats/);
  });
});

describe('a whole match', () => {
  it('plays to the target score under every preset', () => {
    for (const preset of ['classic', 'house', 'chaos'] as const) {
      const live = playOut(open(4, eightsConfig.resolve(applyPresetValues(preset))));
      expect(live.status, preset).toBe('ended');
      expect(live.result, preset).not.toBeNull();
      expect(live.result!.reason, preset).toBe('eights-match');
      const winner = live.result!.winner!;
      expect(live.state.scores[winner]).toBeGreaterThanOrEqual(live.state.rules.targetScore);
      // Every round on the table is a round somebody banked.
      expect(
        live.state.roundsWon.reduce((total, wins) => total + wins, 0),
        preset,
      ).toBe(live.state.roundIndex + 1);
    }
  });

  it('never leaves an acting seat without a legal move, at any table size', () => {
    for (const seats of [2, 3, 5, 6]) {
      const live = playOut(open(seats, { targetScore: 50 }, 7 + seats), 3);
      expect(live.status).toBe('ended');
    }
  });

  it('only ever banks whole rounds — scores match the folded outcomes', () => {
    const live = playOut(open(3, { targetScore: 50 }));
    const banked = live.state.scores.reduce((total, score) => total + score, 0);
    expect(banked).toBeGreaterThan(0);
    expect(live.state.roundsWon.reduce((total, wins) => total + wins, 0)).toBe(
      live.state.roundIndex + 1,
    );
  });
});

describe('replay', () => {
  it('reproduces the match byte for byte from its log', () => {
    const played = playOut(open(3, { targetScore: 60 }, 991));
    const replayed = replaySession(def, played.seed, played.log, {
      config: played.config,
      seats: played.seats,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(played.state));
    expect(replayed.status).toBe('ended');
    expect(replayed.result).toEqual(played.result);
  });

  it('survives a hostile re-check of every player action', () => {
    const played = playOut(open(4, { targetScore: 60 }, 4242));
    expect(
      verifyLog(def, played.seed, played.log, { config: played.config, seats: played.seats }),
    ).toBeNull();
  });
});

describe('an eight on the pile', () => {
  it('parks the table on the suit call until the seat answers', () => {
    let live = open(2, { targetScore: 500 }, 3);
    // Walk the match forward until somebody plays an eight.
    for (let step = 0; step < 400 && live.state.round.awaitingSuit === null; step++) {
      const actor = live.phase.actor;
      if (actor === null) break;
      const legal = def.flow.legalMovesFor!(live.state, live.phase, actor);
      const eight = legal.find((move) => {
        const card = (move.payload as { card?: string } | undefined)?.card;
        return move.id === 'playCard' && typeof card === 'string' && isWild(card);
      });
      const rng = makeRng(live.seed).fork(`ev:${live.log.length}`);
      const choice =
        eight ??
        chooseBotMove(eightsTierBot(2), def.playerView(live.state, actor), actor, legal, rng)!;
      live = sessionApply(def, live, actor as SeatId, choice.id, choice.payload).session;
    }

    expect(live.state.round.awaitingSuit).not.toBeNull();
    expect(live.phase.phase).toBe('choose-suit');
    expect(def.flow.legalMoves(live.state, live.phase).map((move) => move.id)).toEqual([
      'chooseSuit',
      'chooseSuit',
      'chooseSuit',
      'chooseSuit',
    ]);

    const caller = live.state.round.awaitingSuit!;
    const named = sessionApply(def, live, caller, 'chooseSuit', { suit: 'H' });
    expect(named.rejected).toBeUndefined();
    expect(named.session.state.round.activeSuit).toBe('H');
  });
});

function applyPresetValues(id: string): Partial<EightsRules> {
  const preset = eightsConfig.presets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`unknown preset ${id}`);
  // Every preset runs to a short target so a bot match stays inside the guard.
  return { ...preset.values, targetScore: 60 };
}
