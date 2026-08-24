import { describe, expect, it } from 'vitest';
import { openSession } from './test-util';

describe('playerView', () => {
  it('masks other hands and the stock, never the table or captures', () => {
    const session = openSession({ seed: 77 });
    const view = session.def.playerView(session.state, 0);
    const state = session.state;

    expect(view.hands[0]).toEqual(state.hands[0]);
    expect(view.hands[1]).toEqual(state.hands[1]!.map(() => '??'));
    expect(view.stock.every((card) => card === '??')).toBe(true);
    expect(view.stock).toHaveLength(state.stock.length);
    expect(view.table).toEqual(state.table);

    // the table is public knowledge in scopa — it must stay readable
    expect(view.table.some((card) => card !== '??')).toBe(true);
  });

  it('leaves capture piles readable for every seat', () => {
    const session = openSession({ seed: 78, config: { scopone: true } });
    for (const seat of [0, 1]) {
      const view = session.def.playerView(session.state, seat);
      expect(view.captures).toEqual(session.state.captures);
    }
  });

  it('hides every hidden-zone card id from the serialized view', () => {
    const session = openSession({ seed: 79 });
    const state = session.state;
    const hidden = [...(state.hands[1] ?? []), ...state.stock];
    expect(hidden.length).toBeGreaterThan(0);
    const view = session.def.playerView(state, 0);
    const serialized = JSON.stringify({ hands: view.hands, stock: view.stock });
    for (const card of hidden) {
      expect(serialized).not.toContain(card);
    }
  });

  it('is idempotent — viewing a view changes nothing', () => {
    const session = openSession({ seed: 80 });
    const once = session.def.playerView(session.state, 0);
    const twice = session.def.playerView(once, 0);
    expect(twice).toEqual(once);
  });
});
