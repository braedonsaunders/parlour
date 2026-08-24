import { describe, expect, it } from 'vitest';
import { rulesForKlondikeMode } from '@/lib/klondike/modes';
import { KlondikeTransport } from './KlondikeTransport';

function transport(seed = 31) {
  return new KlondikeTransport({
    mode: 'daily',
    dailyKey: '2026-08-24',
    seed,
    rules: rulesForKlondikeMode('daily'),
  });
}

describe('KlondikeTransport', () => {
  it('publishes a redacted snapshot with no hidden identities', () => {
    const snapshot = transport().getSnapshot();
    expect(snapshot.session.state.stock.every((card) => card === '??')).toBe(true);
    expect(snapshot.session.state.tableau.flatMap((column) => column.down)).not.toContain('S1');
    expect(JSON.stringify(snapshot)).not.toContain('seed');
  });

  it('applies ordinary moves and truncates exactly one accepted event on undo', () => {
    const table = transport();
    const before = table.getSnapshot();
    const drawn = table.dispatch('stock.draw');
    expect(drawn.rejected).toBeNull();
    expect(drawn.snapshot.eventCount).toBe(1);
    expect(drawn.snapshot.session.state.moves).toBe(1);
    const undone = table.undo();
    expect(undone.rejected).toBeNull();
    expect(undone.fx).toEqual([]);
    expect(undone.snapshot.eventCount).toBe(0);
    expect(undone.snapshot.session.state).toEqual(before.session.state);
  });

  it('restarts the same seed with the original setup choreography', () => {
    const table = transport(88);
    const original = table.getSnapshot().session.state;
    table.dispatch('stock.draw');
    const restarted = table.restart();
    expect(restarted.snapshot.session.state).toEqual(original);
    expect(restarted.fx.filter((event) => event.kind === 'card.fly')).toHaveLength(28);
  });
});
