import { describe, expect, it } from 'vitest';
import { makeRng } from './rng';

describe('makeRng', () => {
  it('produces identical streams for identical seeds', () => {
    const a = makeRng(1234);
    const b = makeRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.int(1000));
    const seqB = Array.from({ length: 20 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBeGreaterThan(1);
  });

  it('diverges across seeds', () => {
    const one = makeRng(1);
    const two = makeRng(2);
    const a = Array.from({ length: 10 }, () => one.int(1e6));
    const b = Array.from({ length: 10 }, () => two.int(1e6));
    expect(a).not.toEqual(b);
  });

  it('int stays in range and rejects bad bounds', () => {
    const r = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = r.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
    expect(() => r.int(0)).toThrow();
    expect(() => r.int(2.5)).toThrow();
  });

  it('float is in [0,1)', () => {
    const r = makeRng(99);
    for (let i = 0; i < 500; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle returns a new array, permutes, and is seed-stable', () => {
    const src = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const one = makeRng(42).shuffle(src);
    const two = makeRng(42).shuffle(src);
    expect(one).not.toBe(src);
    expect(one).toEqual(two);
    expect([...one].sort()).toEqual([...src].sort());
    expect(src).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('pick draws from the collection and throws when empty', () => {
    const r = makeRng(3);
    const items = ['x', 'y', 'z'];
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });

  it('fork yields deterministic sub-streams that do not disturb the parent', () => {
    const parent = makeRng(500);
    parent.int(10);
    const before = parent.getState();

    const forkA = parent.fork('deal');
    const forkB = parent.fork('deal');
    const forkC = parent.fork('bots');

    expect(parent.getState()).toEqual(before);
    expect(forkA.int(1e6)).toBe(forkB.int(1e6));
    expect(forkA.getState()).not.toEqual(forkC.getState());
  });

  it('round-trips state', () => {
    const r = makeRng(88);
    r.int(100);
    const snapshot = r.getState();
    const after = [r.int(1e6), r.int(1e6), r.int(1e6)];

    r.setState(snapshot);
    expect([r.int(1e6), r.int(1e6), r.int(1e6)]).toEqual(after);

    const fresh = makeRng(1);
    fresh.setState(snapshot);
    expect([fresh.int(1e6), fresh.int(1e6), fresh.int(1e6)]).toEqual(after);
    expect(() => fresh.setState('nope')).toThrow();
  });
});
