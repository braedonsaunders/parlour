import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LISTING_TTL_SECONDS,
  type browseOpenTables,
  type OpenTableListing,
} from '@/lib/multiplayer/RoomDirectory';
import { useLocaleStore } from '@/stores/locale';
import { OpenTables } from './OpenTables';

const NOW = 1_800_000_000;

function listing(over: Partial<OpenTableListing> = {}): OpenTableListing {
  return {
    code: 'ABCD',
    hostPubkey: 'f'.repeat(64),
    gameId: 'spades',
    seats: 4,
    filled: 3,
    hostName: 'Rosa',
    security: 'open',
    listedAt: NOW,
    expiresAt: NOW + LISTING_TTL_SECONDS,
    ...over,
  };
}

/**
 * A stand-in for the relay subscription, so the component can be driven a row
 * at a time without a network. It hands back the same `close()` contract the
 * real browser does, which is what proves the effect tears down.
 */
function fakeBrowse(): {
  browse: (options: {
    onChange(tables: readonly OpenTableListing[]): void;
    onSettled?: () => void;
  }) => { close(): void };
  push(tables: readonly OpenTableListing[]): void;
  settle(): void;
  closes: number;
} {
  let onChange: ((tables: readonly OpenTableListing[]) => void) | undefined;
  let onSettled: (() => void) | undefined;
  const handle = {
    closes: 0,
    browse: (options: {
      onChange(tables: readonly OpenTableListing[]): void;
      onSettled?: () => void;
    }) => {
      onChange = options.onChange;
      onSettled = options.onSettled;
      return {
        close: () => {
          handle.closes += 1;
        },
      };
    },
    push: (tables: readonly OpenTableListing[]) => act(() => onChange?.(tables)),
    settle: () => act(() => onSettled?.()),
  };
  return handle as ReturnType<typeof fakeBrowse>;
}

describe('OpenTables', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en', chosen: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: Partial<Parameters<typeof OpenTables>[0]> = {}) {
    const harness = fakeBrowse();
    act(() =>
      root.render(
        <OpenTables
          onPick={() => undefined}
          browse={
            harness.browse as unknown as typeof import('@/lib/multiplayer/RoomDirectory').browseOpenTables
          }
          {...props}
        />,
      ),
    );
    return harness;
  }

  /**
   * "Nothing here" and "still looking" are different answers, and showing the
   * first while the relays are still replaying is how a working browser reads
   * as a broken one.
   */
  it('says it is still looking until the relays have replayed', () => {
    const harness = render();
    expect(container.textContent).toContain('Looking for open tables');
    harness.settle();
    expect(container.textContent).toContain('No open tables right now');
  });

  it('names the game, the host and the chairs still free', () => {
    const harness = render();
    harness.push([listing()]);

    const row = container.querySelector('[data-testid="open-table"]');
    expect(row?.textContent).toContain('Spades');
    expect(row?.textContent).toContain('Hosted by Rosa');
    expect(row?.textContent).toContain('1 chair open');
  });

  /**
   * Every room parlour deals is veiled, so the badge marks the exception: a
   * table announced by an older build that still deals in the open. A pill on
   * every row would be furniture nobody reads.
   */
  it('marks an open-hands table and leaves a veiled one unmarked', () => {
    const harness = render();
    harness.push([listing({ security: 'veil' })]);
    expect(container.querySelector('[data-testid="open-table"]')?.textContent).not.toContain(
      'Open hands',
    );

    harness.push([listing({ security: 'open' })]);
    expect(container.querySelector('[data-testid="open-table"]')?.textContent).toContain(
      'Open hands',
    );
  });

  /**
   * The shelf calls wildpile "wild" and rooms call it "wildpile". A browser
   * keyed on the wrong one of those renders a raw id at players.
   */
  it('resolves a room game id the shelf spells differently', () => {
    const harness = render();
    harness.push([listing({ gameId: 'wildpile', seats: 4, filled: 2 })]);
    const row = container.querySelector('[data-testid="open-table"]');
    expect(row?.textContent).not.toContain('wildpile');
    expect(row?.textContent).toContain('Wild');
  });

  /**
   * The host key travelling with the row is the whole security upside of
   * browsing over typing: it pins the join, which a four-character code cannot.
   */
  it('hands back the code and the host key it was listed under', () => {
    const onPick = vi.fn();
    const harness = render({ onPick });
    harness.push([listing()]);

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-table"]')?.click());
    expect(onPick).toHaveBeenCalledWith('ABCD', 'f'.repeat(64));
  });

  it('refuses clicks while a join is already in flight', () => {
    const onPick = vi.fn();
    const harness = render({ onPick, disabled: true });
    harness.push([listing()]);

    act(() => container.querySelector<HTMLButtonElement>('[data-testid="open-table"]')?.click());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes its subscription when the screen goes away', () => {
    const harness = render();
    act(() => root.unmount());
    expect(harness.closes).toBe(1);
    root = createRoot(container);
  });

  /**
   * The hermetic suite exists so the browser tests never touch a public relay.
   * A join screen that dialled eleven of them anyway would undo that on every
   * page the suite renders.
   */
  it('does not reach for the relays on a page running hermetic signalling', () => {
    const browse = vi.fn();
    const marker = window as unknown as Record<string, unknown>;
    marker.__PARLOUR_E2E_SIGNALING__ = { publicKey: 'x' };
    try {
      act(() =>
        root.render(
          <OpenTables
            onPick={() => undefined}
            browse={browse as unknown as typeof browseOpenTables}
          />,
        ),
      );
      expect(browse).not.toHaveBeenCalled();
      expect(container.textContent).toContain('No open tables right now');
    } finally {
      delete marker.__PARLOUR_E2E_SIGNALING__;
    }
  });

  it('translates with the rest of the join screen', () => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    const harness = render();
    harness.push([listing()]);
    expect(container.textContent).toContain('Mesas abiertas');
    expect(container.textContent).toContain('Anfitrión: Rosa');
    expect(container.textContent).toContain('1 silla libre');
  });
});
