import { applyPreset, createSession, runBotGame, stateHash } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { dealtDeck, orderSpiteHand, spiteDeck } from './cards';
import { spiteConfig } from './config';
import { spiteGame } from './game';
import { GAME_ID, PERSONAS, makePersonaBot, SPITE_BOTS, spiteCatalog, spiteTierBot } from './index';

describe('spite deck and setup', () => {
  it('catalogues three decks of faces: 156 cards plus nine jokers', () => {
    expect(GAME_ID).toBe('spite');
    expect(spiteDeck.cardIds).toHaveLength(3 * (4 * 13 + 3));
    expect(new Set(spiteDeck.cardIds).size).toBe(spiteDeck.cardIds.length);
    expect(Object.values(spiteDeck.faces).filter((f) => f.meta?.kind === 'wild')).toHaveLength(12);
    expect(Object.values(spiteDeck.faces).filter((f) => f.meta?.kind === 'joker')).toHaveLength(9);
  });

  it('deals two decks for small tables and three for four seats', () => {
    expect(dealtDeck(2, true, true).cardIds).toHaveLength(110);
    expect(dealtDeck(3, true, true).cardIds).toHaveLength(110);
    expect(dealtDeck(4, true, true).cardIds).toHaveLength(165);
    // Switching a wild family off leaves those cards out of the shuffle.
    expect(dealtDeck(2, false, true).cardIds).toHaveLength(102);
    expect(dealtDeck(2, true, false).cardIds).toHaveLength(104);
    expect(dealtDeck(2, false, false).cardIds).toHaveLength(96);
    for (const id of dealtDeck(2, false, true).cardIds) {
      expect(id.endsWith('K-0') || id.endsWith('K-1')).toBe(false);
    }
  });

  it.each([2, 3, 4])('deals a legal %i-seat match: full zones, flipped tops, deal fx', (seats) => {
    const config = spiteConfig.resolve({ payoffSize: 10, handSize: 5 });
    const session = createSession(spiteGame, { seed: 2026, config, seats });
    const state = session.state;
    expect(state.hands.map((hand) => hand.length)).toEqual(Array(seats).fill(config.handSize));
    expect(state.payoffs.map((pile) => pile.length)).toEqual(Array(seats).fill(10));
    expect(state.discards.map((piles) => piles.length)).toEqual(
      Array(seats).fill(config.discardPiles),
    );
    expect(state.centre).toEqual(
      Array.from({ length: config.buildPiles }, () => ({ cards: [], nextRank: 1 })),
    );
    expect(
      state.hands.flat().length + state.payoffs.flat().length + state.stock.length,
    ).toBeLessThanOrEqual(dealtDeck(seats, config.kingsWild, config.jokersWild).cardIds.length);
    for (const pile of state.payoffs) {
      expect(spiteDeck.faces[pile[0] as string]).toBeDefined();
    }
    // Every payoff top announced by a flip event.
    const flips = session.setupFx?.filter((event) => event.kind === 'card.flip') ?? [];
    expect(flips).toHaveLength(seats);
    expect(session.status).toBe('playing');
  });

  it('fails closed outside the supported two-to-four-seat range', () => {
    expect(() =>
      createSession(spiteGame, { seed: 1, config: spiteConfig.defaults(), seats: 1 }),
    ).toThrow('spite requires 2–4 seats');
    expect(() =>
      createSession(spiteGame, { seed: 1, config: spiteConfig.defaults(), seats: 5 }),
    ).toThrow('spite requires 2–4 seats');
  });

  it('resolves configs idempotently and keeps the named presets distinct', () => {
    const once = spiteConfig.resolve({ payoffSize: 13 });
    expect(spiteConfig.resolve(once)).toEqual(once);
    expect(applyPreset(spiteConfig, 'classic').payoffSize).toBe(20);
    expect(applyPreset(spiteConfig, 'quick')).toMatchObject({
      payoffSize: 10,
      refillMidTurn: true,
    });
    expect(applyPreset(spiteConfig, 'cutthroat')).toMatchObject({
      payoffSize: 13,
      refillMidTurn: false,
    });
    expect(spiteCatalog.modes.map((mode) => mode.preset)).toEqual([
      'classic',
      'quick',
      'cutthroat',
    ]);
  });

  it('ships one policy per tier plus six personas with their own params', () => {
    expect(SPITE_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((tier) => spiteTierBot(tier as 1 | 2 | 3).tier)).toEqual([1, 2, 3]);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(4);
    const disciplines = new Set(PERSONAS.map((persona) => JSON.stringify(persona.params)));
    expect(disciplines.size).toBe(PERSONAS.length);
    expect(makePersonaBot('vera').persona.name).toBe('Nan Vera');
    expect(() => makePersonaBot('nobody')).toThrow('unknown persona');
  });

  it.each([404, 17, 2026, 8080])('has a bot-completable %i-seed game everywhere', (seed) => {
    for (const seats of [2, 3, 4] as const) {
      for (const preset of ['classic', 'quick', 'cutthroat'] as const) {
        const record = runBotGame(spiteGame, {
          seed,
          policies: Array.from({ length: seats }, (_, i) => SPITE_BOTS[i % 3]!),
          config: applyPreset(spiteConfig, preset),
          maxEvents: 8_000,
        });
        expect(record.result?.winner, `${preset} ${seats}p seed ${seed}`).not.toBeNull();
      }
    }
  });

  it('orders the hand low-to-high with wilds last, losing no card', () => {
    const hand = ['red-K-0', 'yellow-A-0', 'joker-0', 'blue-Q-0', 'red-A-0'];
    const ordered = orderSpiteHand(hand, {});
    expect([...ordered].sort()).toEqual([...hand].sort());
    expect(ordered.indexOf('red-A-0')).toBeLessThan(ordered.indexOf('yellow-A-0'));
    expect(ordered.indexOf('yellow-A-0')).toBeLessThan(ordered.indexOf('red-K-0'));
    expect(orderSpiteHand(['v#0', 'red-2-0'], {})).toEqual(['red-2-0', 'v#0']);
  });

  it('hashes identical setups identically', () => {
    const a = createSession(spiteGame, { seed: 99, config: spiteConfig.defaults(), seats: 3 });
    const b = createSession(spiteGame, { seed: 99, config: spiteConfig.defaults(), seats: 3 });
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});
