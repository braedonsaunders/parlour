import { describe, expect, it } from 'vitest';
import { DECK, PYRAMID_SIZE } from './cards';
import { pyramidGame } from './game';
import { openSession } from './test-util';

describe('Pyramid privacy boundary', () => {
  it('hides stock order while keeping every pyramid and waste card public', () => {
    const session = openSession(404);
    const view = pyramidGame.playerView(session.state, 0);
    expect(view.stock).toEqual(session.state.stock.map(() => '??'));
    expect(view.pyramid).toEqual(session.state.pyramid);
    expect(view.waste).toEqual(session.state.waste);
    const json = JSON.stringify(view);
    const publicIds = new Set([
      ...session.state.waste,
      ...session.state.pyramid.flat().filter((card): card is string => card !== null),
    ]);
    for (const card of session.state.stock) {
      if (!publicIds.has(card)) expect(json).not.toContain(`"${card}"`);
    }
  });

  it('emits public setup flights for the twenty-eight pyramid cards only', () => {
    const session = openSession(405);
    const flights = (session.setupFx ?? []).filter((event) => event.kind === 'card.fly');
    expect(flights).toHaveLength(PYRAMID_SIZE);
    const payloads = flights.map(
      (event) => event.payload as { card: string; faceDown: boolean; to: string },
    );
    expect(payloads.every((payload) => payload.faceDown === false)).toBe(true);
    expect(payloads.every((payload) => payload.to.startsWith('pyramid:'))).toBe(true);
    const fxJson = JSON.stringify(session.setupFx);
    const publicIds = new Set(
      session.state.pyramid.flat().filter((card): card is string => card !== null),
    );
    for (const card of session.state.stock) {
      if (!publicIds.has(card)) expect(fxJson).not.toContain(`"${card}"`);
    }
    expect(DECK.cardIds).toHaveLength(52);
  });

  it('does not advertise Veil, bots, multiplayer seats, a seed, or a daily key in state', () => {
    const session = openSession(406);
    expect(pyramidGame.veil).toBeUndefined();
    expect(pyramidGame.bots).toEqual([]);
    expect(session.seats).toBe(1);
    expect(session.state).not.toHaveProperty('seed');
    expect(session.state).not.toHaveProperty('dailyKey');
    expect(pyramidGame.flow.legalMovesFor?.(session.state, session.phase, 1)).toEqual([]);
  });
});
