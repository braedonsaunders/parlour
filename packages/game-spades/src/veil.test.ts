import { describe, expect, it } from 'vitest';
import { createSession, stateHash } from '@parlour/engine';
import { DECK } from './cards';
import { spadesConfig } from './config';
import { spadesGame } from './game';

const config = spadesConfig.resolve({});

describe('playerView redaction', () => {
  it('keeps the viewing seat’s real hand and hides everyone else as equal-length ??', () => {
    const session = createSession(spadesGame, { seed: 8_001, config, seats: 4 });
    const view = spadesGame.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    for (const seat of [1, 2, 3]) {
      expect(view.hands[seat]).toHaveLength(13);
      expect(view.hands[seat]!.every((card) => card === '??')).toBe(true);
    }
    expect(view.bids).toEqual(session.state.bids);
    expect(view.scores).toEqual(session.state.scores);
    expect(view.bags).toEqual(session.state.bags);
    expect(view.dealer).toBe(session.state.dealer);
  });

  it('JSON of a view does not contain another seat’s card ids', () => {
    const session = createSession(spadesGame, { seed: 8_002, config, seats: 4 });
    const view = spadesGame.playerView(session.state, 1);
    const json = JSON.stringify(view);
    for (const card of session.state.hands[0] ?? []) {
      expect(json.includes(`"${card}"`)).toBe(false);
    }
    for (const card of session.state.hands[1] ?? []) {
      expect(json.includes(`"${card}"`)).toBe(true);
    }
  });

  it('legalMovesFor a non-acting seat is empty (no leaked cards)', () => {
    const session = createSession(spadesGame, { seed: 8_003, config, seats: 4 });
    const actor = session.state.turn;
    const other = (actor + 1) % 4;
    const leaked =
      spadesGame.flow.legalMovesFor?.(session.state, session.phase, other) ?? [];
    expect(leaked).toEqual([]);
  });
});

describe('veil support', () => {
  it('declares a 52-card veiled deal with no public setup', () => {
    expect(spadesGame.veil).toBeDefined();
    const deck = spadesGame.veil!.deck(config);
    expect(deck.cardIds).toHaveLength(DECK.cardIds.length);
    expect(spadesGame.veil!.publicSetupFrom(4, config)).toBe(52);
    expect(spadesGame.veil!.publicSetupReady([], 4, config)).toBe(true);
  });

  it('a veiled session hashes stably for the same ceremony order', () => {
    const deckOrder = Array.from({ length: 52 }, (_, index) => `v#${index}`);
    const a = createSession(spadesGame, {
      seed: 9_001,
      config,
      seats: 4,
      veiled: true,
      deckOrder,
    });
    const b = createSession(spadesGame, {
      seed: 9_001,
      config,
      seats: 4,
      veiled: true,
      deckOrder,
    });
    expect(a.state.veiled).toBe(true);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.state.hands.flat().every((card) => card.startsWith('v#'))).toBe(true);
  });
});
