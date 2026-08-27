import { describe, expect, it } from 'vitest';
import { TABLEAU_SIZE } from '@parlour/game-tripeaks';
import { rulesForTripeaksMode } from '@/lib/tripeaks/modes';
import { TripeaksTransport } from './TripeaksTransport';

function transport(seed = 31) {
  return new TripeaksTransport({
    mode: 'daily',
    dailyKey: '2026-08-24',
    seed,
    rules: rulesForTripeaksMode('daily'),
  });
}

describe('TripeaksTransport', () => {
  it('publishes a redacted snapshot with no hidden identities', () => {
    const snapshot = transport().getSnapshot();
    expect(snapshot.session.state.stock.every((card) => card === '??')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('seed');
  });

  it('applies ordinary moves and truncates exactly one accepted event on undo', () => {
    const table = transport();
    const before = table.getSnapshot();
    const flipped = table.dispatch('stock.flip');
    expect(flipped.rejected).toBeNull();
    expect(flipped.snapshot.eventCount).toBe(1);
    expect(flipped.snapshot.session.state.moves).toBe(1);
    const undone = table.undo();
    expect(undone.rejected).toBeNull();
    expect(undone.fx).toEqual([]);
    expect(undone.snapshot.eventCount).toBe(0);
    expect(undone.snapshot.session.state).toEqual(before.session.state);
  });

  it('restarts the same seed with the original setup choreography', () => {
    const table = transport(88);
    const original = table.getSnapshot().session.state;
    table.dispatch('stock.flip');
    const restarted = table.restart();
    expect(restarted.snapshot.session.state).toEqual(original);
    expect(restarted.fx.filter((event) => event.kind === 'card.fly')).toHaveLength(
      TABLEAU_SIZE + 1,
    );
  });
});
