import { describe, expect, it } from 'vitest';
import { DECK, TABLEAU_SIZE } from './cards';
import { golfGame } from './game';
import { openSession } from './test-util';

describe('Golf privacy boundary', () => {
  it('hides stock order while keeping every tableau and hole card public', () => {
    const session = openSession(404);
    const view = golfGame.playerView(session.state, 0);
    expect(view.stock).toEqual(session.state.stock.map(() => '??'));
    expect(view.tableau).toEqual(session.state.tableau);
    expect(view.waste).toEqual(session.state.waste);
    const json = JSON.stringify(view);
    const publicIds = new Set([...session.state.waste, ...session.state.tableau.flat()]);
    for (const card of session.state.stock) {
      if (!publicIds.has(card)) expect(json).not.toContain(`"${card}"`);
    }
  });

  it('emits public setup flights for the thirty-five grass cards and the opening hole', () => {
    const session = openSession(405);
    const flights = (session.setupFx ?? []).filter((event) => event.kind === 'card.fly');
    expect(flights).toHaveLength(TABLEAU_SIZE + 1);
    const payloads = flights.map(
      (event) => event.payload as { card: string; faceDown: boolean; to: string },
    );
    expect(payloads.every((payload) => payload.faceDown === false)).toBe(true);
    expect(payloads.filter((payload) => payload.to.startsWith('tableau:'))).toHaveLength(
      TABLEAU_SIZE,
    );
    expect(payloads.filter((payload) => payload.to === 'waste')).toHaveLength(1);
    const fxJson = JSON.stringify(session.setupFx);
    const publicIds = new Set([...session.state.waste, ...session.state.tableau.flat()]);
    for (const card of session.state.stock) {
      if (!publicIds.has(card)) expect(fxJson).not.toContain(`"${card}"`);
    }
    expect(DECK.cardIds).toHaveLength(52);
  });

  it('does not advertise Veil, bots, multiplayer seats, a seed, or a daily key in state', () => {
    const session = openSession(406);
    expect(golfGame.veil).toBeUndefined();
    expect(golfGame.bots).toEqual([]);
    expect(session.seats).toBe(1);
    expect(session.state).not.toHaveProperty('seed');
    expect(session.state).not.toHaveProperty('dailyKey');
    expect(golfGame.flow.legalMovesFor?.(session.state, session.phase, 1)).toEqual([]);
  });
});
