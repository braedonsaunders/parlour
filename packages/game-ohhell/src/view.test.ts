import { describe, expect, it } from 'vitest';
import { createSession } from '@parlour/engine';
import { ohhellConfig } from './config';
import { ohhellGame } from './game';

const config = ohhellConfig.resolve({ handSize: 6 });
const small = ohhellConfig.resolve({ handSize: 5 });

describe('playerView redaction', () => {
  it('keeps the viewing seat’s hand and masks the other hands and the stock', () => {
    const session = createSession(ohhellGame, { seed: 8_001, config, seats: 4 });
    const view = ohhellGame.playerView(session.state, 0);
    expect(view.hands[0]).toEqual(session.state.hands[0]);
    for (const seat of [1, 2, 3]) {
      expect(view.hands[seat]).toHaveLength(session.state.handSize);
      expect(view.hands[seat]!.every((card) => card === '??')).toBe(true);
    }
    expect(view.stock.every((card) => card === '??')).toBe(true);
    expect(view.stock).toHaveLength(session.state.stock.length);
    // public table facts stay visible
    expect(view.trumpCard).toEqual(session.state.trumpCard);
    expect(view.trumpSuit).toEqual(session.state.trumpSuit);
    expect(view.bids).toEqual(session.state.bids);
    expect(view.played).toEqual(session.state.played);
    expect(view.dealer).toBe(session.state.dealer);
  });

  it('JSON of a view never contains another seat’s cards or the stock', () => {
    const session = createSession(ohhellGame, { seed: 8_002, config, seats: 4 });
    const view = ohhellGame.playerView(session.state, 1);
    const json = JSON.stringify(view);
    const hidden = [
      ...(session.state.hands[0] ?? []),
      ...(session.state.hands[2] ?? []),
      ...(session.state.hands[3] ?? []),
      ...session.state.stock,
    ];
    for (const card of hidden) {
      expect(json.includes(`"${card}"`)).toBe(false);
    }
    for (const card of session.state.hands[1] ?? []) {
      expect(json.includes(`"${card}"`)).toBe(true);
    }
  });

  it('setup deal fx carries no face ids while the flip names the trump', () => {
    const session = createSession(ohhellGame, { seed: 8_004, config: small, seats: 4 });
    const fxJson = JSON.stringify(session.setupFx ?? []);
    for (const card of session.state.hands.flat()) {
      expect(fxJson.includes(`"${card}"`)).toBe(false);
    }
    if (session.state.trumpCard !== null) {
      // the trump is PUBLIC once flipped — its id is supposed to be there
      expect(fxJson.includes(`"${session.state.trumpCard}"`)).toBe(true);
    } else {
      expect(fxJson.includes('ohhell.trump-turned')).toBe(false);
    }
  });

  it('legalMovesFor a non-acting seat is empty (no leaked options)', () => {
    const session = createSession(ohhellGame, { seed: 8_003, config, seats: 4 });
    const actor = session.state.turn;
    const other = (actor + 1) % 4;
    const leaked = ohhellGame.flow.legalMovesFor?.(session.state, session.phase, other) ?? [];
    expect(leaked).toEqual([]);
  });

  it('does not advertise Veil — a match-shaped game cannot run veiled rounds', () => {
    expect(ohhellGame.veil).toBeUndefined();
  });
});
