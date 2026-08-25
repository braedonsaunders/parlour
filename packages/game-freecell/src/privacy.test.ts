import { describe, expect, it } from 'vitest';
import { DECK } from './cards';
import { freecellGame, freecellPlayerView } from './game';
import { openSession } from './test-util';

describe('FreeCell privacy boundary', () => {
  it('exposes every card and still returns a copy of the public surface', () => {
    const session = openSession(404);
    const view = freecellGame.playerView(session.state, 0);
    expect(view.tableau).toEqual(session.state.tableau);
    expect(view.cells).toEqual(session.state.cells);
    expect(view.foundations).toEqual(session.state.foundations);
    expect(view.tableau).not.toBe(session.state.tableau);
    expect(JSON.stringify(view)).not.toContain('??');
    const ids = [
      ...view.tableau.flat(),
      ...view.cells.filter((card): card is string => card !== null),
      ...Object.values(view.foundations).flat(),
    ];
    expect(new Set(ids)).toEqual(new Set(DECK.cardIds));
    expect(freecellPlayerView(session.state)).toEqual(view);
  });

  it('emits public setup flights for all fifty-two tableau cards', () => {
    const session = openSession(405);
    const flights = (session.setupFx ?? []).filter((event) => event.kind === 'card.fly');
    expect(flights).toHaveLength(52);
    const payloads = flights.map(
      (event) => event.payload as { card: string; faceDown: boolean; to: string },
    );
    expect(payloads.every((payload) => payload.faceDown === false)).toBe(true);
    expect(payloads.every((payload) => payload.to.startsWith('tableau:'))).toBe(true);
    expect(new Set(payloads.map((payload) => payload.card))).toEqual(new Set(DECK.cardIds));
    expect(DECK.cardIds).toHaveLength(52);
  });

  it('does not advertise Veil, bots, multiplayer seats, a seed, or a daily key in state', () => {
    const session = openSession(406);
    expect(freecellGame.veil).toBeUndefined();
    expect(freecellGame.bots).toEqual([]);
    expect(session.seats).toBe(1);
    expect(session.state).not.toHaveProperty('seed');
    expect(session.state).not.toHaveProperty('dailyKey');
    expect(freecellGame.flow.legalMovesFor?.(session.state, session.phase, 1)).toEqual([]);
  });
});
