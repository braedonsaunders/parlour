import { describe, expect, it } from 'vitest';
import { createSession } from '@parlour/engine';
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

  it('setup deal FX JSON scan does not expose opponent card IDs', () => {
    const viewer = 0;
    const session = createSession(spadesGame, { seed: 8_004, config, seats: 4 });
    const fxJson = JSON.stringify(session.setupFx ?? []);
    const dealt = session.state.hands.flat();
    expect(dealt).toHaveLength(52);
    for (const card of dealt) {
      expect(fxJson.includes(`"${card}"`)).toBe(false);
    }
    for (const seat of [1, 2, 3] as const) {
      for (const card of session.state.hands[seat] ?? []) {
        expect(fxJson.includes(`"${card}"`)).toBe(false);
      }
    }
    const deals = (session.setupFx ?? []).filter((event) => event.kind === 'card.fly');
    expect(deals).toHaveLength(52);
    for (const event of deals) {
      const payload = event.payload as { card?: string; from?: string; to?: string; dur?: number };
      expect(payload.from).toBe('stock');
      expect(payload.to).toMatch(/^hand:[0-3]$/);
      expect(payload.dur).toBe(220);
      expect(payload.card === undefined || payload.card === '??').toBe(true);
    }
    const view = spadesGame.playerView(session.state, viewer);
    expect(view.hands[viewer]).toEqual(session.state.hands[viewer]);
    for (const seat of [1, 2, 3] as const) {
      expect(view.hands[seat]!.every((card) => card === '??')).toBe(true);
    }
  });

  it('legalMovesFor a non-acting seat is empty (no leaked cards)', () => {
    const session = createSession(spadesGame, { seed: 8_003, config, seats: 4 });
    const actor = session.state.turn;
    const other = (actor + 1) % 4;
    const leaked = spadesGame.flow.legalMovesFor?.(session.state, session.phase, other) ?? [];
    expect(leaked).toEqual([]);
  });
});

describe('veil support', () => {
  it('advertises a deck, a hand size and its own redeal move', () => {
    expect(spadesGame.veil).toBeDefined();
    expect(spadesGame.veil!.redealMove).toBe('nextHand');
    expect(spadesGame.veil!.deck(spadesConfig.defaults()).cardIds).toHaveLength(52);
    // Thirteen cards a seat and nothing turned face up, so the whole deck is
    // dealt from the ceremony with no public setup opening first.
    expect(spadesGame.veil!.publicSetupFrom(4, spadesConfig.defaults())).toBe(52);
    expect(spadesGame.veil!.publicSetupReady([], 4, spadesConfig.defaults())).toBe(true);
  });
});
