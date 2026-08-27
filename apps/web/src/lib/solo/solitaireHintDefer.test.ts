import { describe, expect, it } from 'vitest';
import { rulesForFreecellMode } from '@/lib/freecell/modes';
import { freecellTableView } from '@/lib/freecell/view';
import { rulesForGolfMode } from '@/lib/golf/modes';
import { golfTableView } from '@/lib/golf/view';
import { rulesForKlondikeMode } from '@/lib/klondike/modes';
import { klondikeTableView } from '@/lib/klondike/view';
import { rulesForPyramidMode } from '@/lib/pyramid/modes';
import { pyramidTableView } from '@/lib/pyramid/view';
import { rulesForSpiderMode } from '@/lib/spider/modes';
import { spiderTableView } from '@/lib/spider/view';
import { rulesForTripeaksMode } from '@/lib/tripeaks/modes';
import { tripeaksTableView } from '@/lib/tripeaks/view';
import { FreecellTransport } from './FreecellTransport';
import { GolfTransport } from './GolfTransport';
import { KlondikeTransport } from './KlondikeTransport';
import { PyramidTransport } from './PyramidTransport';
import { SpiderTransport } from './SpiderTransport';
import { TripeaksTransport } from './TripeaksTransport';

function unreadHint<T extends object>(snapshot: T): T {
  return new Proxy(snapshot, {
    get(target, prop, receiver) {
      if (prop === 'hint') {
        throw new Error('hint must stay unread until the table shows one');
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

describe('solitaire table views defer the solver-backed hint', () => {
  it.each([
    [
      'klondike',
      () =>
        klondikeTableView(
          unreadHint(
            new KlondikeTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForKlondikeMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
    [
      'spider',
      () =>
        spiderTableView(
          unreadHint(
            new SpiderTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForSpiderMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
    [
      'freecell',
      () =>
        freecellTableView(
          unreadHint(
            new FreecellTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForFreecellMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
    [
      'golf',
      () =>
        golfTableView(
          unreadHint(
            new GolfTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForGolfMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
    [
      'pyramid',
      () =>
        pyramidTableView(
          unreadHint(
            new PyramidTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForPyramidMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
    [
      'tripeaks',
      () =>
        tripeaksTableView(
          unreadHint(
            new TripeaksTransport({
              mode: 'daily',
              dailyKey: '2026-08-24',
              seed: 31,
              rules: rulesForTripeaksMode('daily'),
            }).getSnapshot(),
          ),
          [],
        ),
    ],
  ])('%s builds the view without reading snapshot.hint', (_name, build) => {
    expect(build).not.toThrow();
    expect(Object.getOwnPropertyDescriptor(build(), 'hint')?.get).toEqual(expect.any(Function));
  });
});
