import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FxEvent } from '@parlour/engine';
import { rulesForKlondikeMode } from './modes';
import { KlondikeTransport } from '@/lib/solo/KlondikeTransport';
import { useKlondikeDealPresentation, type KlondikeDealPresentation } from './deal-presentation';

const seen: { current: KlondikeDealPresentation | null } = { current: null };
let container: HTMLDivElement;
let root: Root;

function openingFx(): readonly FxEvent[] {
  return (
    new KlondikeTransport({
      mode: 'daily',
      dailyKey: '2026-08-24',
      seed: 31,
      rules: rulesForKlondikeMode('daily'),
    }).getSnapshot().session.setupFx ?? []
  );
}

function Probe({ fx, reduced = false }: { fx: readonly FxEvent[]; reduced?: boolean }) {
  const presentation = useKlondikeDealPresentation(fx, 'deal', reduced);
  useEffect(() => {
    seen.current = presentation;
  });
  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  seen.current = null;
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  container.remove();
});

describe('useKlondikeDealPresentation', () => {
  it('counts all 28 opaque/public flights without ever revealing too many cards', () => {
    vi.useFakeTimers();
    const fx = openingFx();
    expect(fx.filter((event) => event.kind === 'card.fly')).toHaveLength(28);
    act(() => root.render(<Probe fx={fx} />));

    expect(seen.current!.visibleByColumn).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(seen.current!.dealing).toBe(true);

    for (let elapsed = 0; elapsed < 3_000; elapsed += 70) {
      const counts = seen.current!.visibleByColumn;
      counts.forEach((count, column) => {
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(column + 1);
      });
      act(() => void vi.advanceTimersByTime(70));
    }

    expect(seen.current!.visibleByColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.current!.dealing).toBe(false);
  });

  it('settles the entire layout immediately for calm motion', () => {
    vi.useFakeTimers();
    act(() => root.render(<Probe fx={openingFx()} reduced />));
    expect(seen.current!.visibleByColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.current!.dealing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a live partial deal when calm motion is enabled and never replays it', () => {
    vi.useFakeTimers();
    const fx = openingFx();
    act(() => root.render(<Probe fx={fx} />));
    act(() => void vi.advanceTimersByTime(500));
    expect(seen.current!.dealing).toBe(true);

    act(() => root.render(<Probe fx={fx} reduced />));
    expect(seen.current!.visibleByColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.current!.dealing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    act(() => root.render(<Probe fx={fx} />));
    expect(seen.current!.visibleByColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.current!.dealing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gates nothing for an ordinary move timeline', () => {
    act(() =>
      root.render(
        <Probe
          fx={[
            {
              kind: 'klondike.cards-move',
              payload: { cards: ['C7'], from: 'tableau:0', to: 'tableau:1' },
              at: 0,
            },
          ]}
        />,
      ),
    );
    expect(seen.current!.visibleByColumn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.current!.dealing).toBe(false);
  });
});
