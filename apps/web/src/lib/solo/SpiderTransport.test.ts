import { describe, expect, it } from 'vitest';
import { rulesForSpiderMode } from '@/lib/spider/modes';
import { SpiderTransport } from './SpiderTransport';

function transport(seed = 31) {
  return new SpiderTransport({
    mode: 'daily',
    dailyKey: '2026-08-24',
    seed,
    rules: rulesForSpiderMode('daily'),
  });
}

describe('SpiderTransport', () => {
  it('publishes a redacted snapshot with no hidden identities', () => {
    const snapshot = transport().getSnapshot();
    expect(snapshot.session.state.stock.every((card) => card === '??')).toBe(true);
    expect(snapshot.session.state.tableau.flatMap((column) => column.down)).not.toContain('S1');
    expect(JSON.stringify(snapshot)).not.toContain('seed');
    expect(snapshot.canFinish).toBe(false);
  });

  it('applies ordinary moves and truncates exactly one accepted event on undo', () => {
    const table = transport();
    const before = table.getSnapshot();
    const legal = table.legalMoves();
    const move = legal.find((entry) => entry.id === 'tableau.move') ?? legal[0];
    expect(move).toBeDefined();
    const played = table.dispatch(move!.id, move!.payload);
    expect(played.rejected).toBeNull();
    expect(played.snapshot.eventCount).toBe(1);
    expect(played.snapshot.session.state.moves).toBe(1);
    const undone = table.undo();
    expect(undone.rejected).toBeNull();
    expect(undone.fx).toEqual([]);
    expect(undone.snapshot.eventCount).toBe(0);
    expect(undone.snapshot.session.state).toEqual(before.session.state);
  });

  it('publishes a greedy hint the engine accepts', () => {
    const table = transport();
    const hinted = table.getSnapshot().hint;
    expect(hinted).not.toBeNull();
    const played = table.dispatch(hinted!.move.id, hinted!.move.payload);
    expect(played.rejected).toBeNull();
    expect(played.snapshot.eventCount).toBe(1);
  });

  it('restarts the same seed with the original setup choreography', () => {
    const table = transport(88);
    const original = table.getSnapshot().session.state;
    const legal = table.legalMoves()[0];
    if (legal) table.dispatch(legal.id, legal.payload);
    const restarted = table.restart();
    expect(restarted.snapshot.session.state).toEqual(original);
    expect(restarted.fx.filter((event) => event.kind === 'card.fly')).toHaveLength(54);
  });
});
