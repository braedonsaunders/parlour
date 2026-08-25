import { describe, expect, it } from 'vitest';
import { deckFor } from './cards';
import { spiderGame } from './game';
import { openSession } from './test-util';

describe('Spider privacy boundary', () => {
  it('hides stock order and tableau-down identities while preserving public faces and counts', () => {
    const session = openSession(404);
    const view = spiderGame.playerView(session.state, 0);
    expect(view.stock).toEqual(session.state.stock.map(() => '??'));
    for (let column = 0; column < 10; column++) {
      expect(view.tableau[column]?.down).toEqual(
        session.state.tableau[column]?.down.map(() => '??'),
      );
      expect(view.tableau[column]?.up).toEqual(session.state.tableau[column]?.up);
    }
    const publicIds = new Set([
      ...session.state.tableau.flatMap((column) => column.up),
      ...session.state.foundations.flat(),
    ]);
    const hiddenIds = [
      ...session.state.stock,
      ...session.state.tableau.flatMap((column) => column.down),
    ];
    const json = JSON.stringify(view);
    for (const card of hiddenIds) {
      if (!publicIds.has(card)) expect(json).not.toContain(`"${card}"`);
    }
  });

  it('emits opaque setup flights for 44 down cards and public ids only for ten upcards', () => {
    const session = openSession(405);
    const flights = (session.setupFx ?? []).filter((event) => event.kind === 'card.fly');
    expect(flights).toHaveLength(54);
    const payloads = flights.map(
      (event) => event.payload as { card: string; faceDown: boolean; to: string },
    );
    expect(payloads.filter((payload) => payload.faceDown && payload.card === '??')).toHaveLength(
      44,
    );
    const visible = new Set(session.state.tableau.flatMap((column) => column.up));
    const publicFxCards = payloads
      .filter((payload) => !payload.faceDown)
      .map((payload) => payload.card);
    expect(new Set(publicFxCards)).toEqual(visible);
    const fxJson = JSON.stringify(session.setupFx);
    const hidden = [
      ...session.state.stock,
      ...session.state.tableau.flatMap((column) => column.down),
    ];
    for (const card of hidden) {
      if (!visible.has(card)) expect(fxJson).not.toContain(`"${card}"`);
    }
    expect(deckFor(2).cardIds).toHaveLength(104);
  });

  it('does not advertise Veil, bots, multiplayer seats, a seed, or a daily key in state', () => {
    const session = openSession(406);
    expect(spiderGame.veil).toBeUndefined();
    expect(spiderGame.bots).toEqual([]);
    expect(session.seats).toBe(1);
    expect(session.state).not.toHaveProperty('seed');
    expect(session.state).not.toHaveProperty('dailyKey');
    expect(spiderGame.flow.legalMovesFor?.(session.state, session.phase, 1)).toEqual([]);
  });
});
