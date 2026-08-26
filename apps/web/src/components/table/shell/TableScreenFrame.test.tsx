import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableScreenFrame } from './TableScreenFrame';

describe('TableScreenFrame', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('preserves the shell, HUD, content, and menu composition without another wrapper', () => {
    const open = vi.fn();
    act(() =>
      root.render(
        <TableScreenFrame
          rootRef={{ current: null }}
          hud={<span data-testid="hud-copy">Round one</span>}
          menu={{ isOpen: false, open, close: vi.fn(), quit: vi.fn() }}
        >
          <section data-testid="felt-copy">Felt</section>
        </TableScreenFrame>,
      ),
    );

    const shell = container.querySelector('main[data-table-screen]');
    expect(shell?.parentElement).toBe(container);
    expect(shell?.querySelector('header [data-testid="hud-copy"]')).not.toBeNull();
    expect(shell?.querySelector('[data-testid="felt-copy"]')).not.toBeNull();
    expect(shell?.querySelector('[data-testid="table-menu"]')).toBeNull();

    act(() => {
      (shell?.querySelector('header button') as HTMLButtonElement).click();
    });
    expect(open).toHaveBeenCalledOnce();
  });

  it('moves through a hand with an arrow and activates the focused card with Enter', () => {
    const play = vi.fn();
    act(() =>
      root.render(
        <TableScreenFrame
          rootRef={{ current: null }}
          hud={null}
          menu={{ isOpen: false, open: vi.fn(), close: vi.fn(), quit: vi.fn() }}
        >
          <div role="list" data-zone="hand:0" aria-label="Your hand">
            <div data-hand-card>
              <button type="button" tabIndex={0}>
                Ace
              </button>
            </div>
            <div data-hand-card>
              <button type="button" tabIndex={-1} onClick={play}>
                Two
              </button>
            </div>
          </div>
        </TableScreenFrame>,
      ),
    );

    const cards = [...container.querySelectorAll<HTMLButtonElement>('[data-hand-card] button')];
    cards[0]?.focus();
    act(() =>
      cards[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(document.activeElement).toBe(cards[1]);

    act(() =>
      cards[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(play).toHaveBeenCalledOnce();
  });

  it('hands focus to the playable hand when a focused decision rail closes', () => {
    const frame = (decision: 'bid' | 'play') => (
      <TableScreenFrame
        rootRef={{ current: null }}
        hud={null}
        menu={{ isOpen: false, open: vi.fn(), close: vi.fn(), quit: vi.fn() }}
      >
        {decision === 'bid' ? (
          <button type="button" data-testid="bid">
            Bid two
          </button>
        ) : (
          <div role="list" data-zone="hand:0" aria-label="Your hand">
            <div data-hand-card>
              <button type="button" tabIndex={0}>
                Play ace
              </button>
            </div>
          </div>
        )}
      </TableScreenFrame>
    );

    act(() => root.render(frame('bid')));
    const bid = container.querySelector<HTMLButtonElement>('[data-testid="bid"]')!;
    bid.focus();
    expect(document.activeElement).toBe(bid);

    act(() => root.render(frame('play')));
    expect(document.activeElement).toBe(
      container.querySelector<HTMLButtonElement>('[data-hand-card] button'),
    );
  });

  it('moves from a solitaire source to a pointer-equivalent target', () => {
    const move = vi.fn();
    act(() =>
      root.render(
        <TableScreenFrame
          rootRef={{ current: null }}
          hud={null}
          menu={{ isOpen: false, open: vi.fn(), close: vi.fn(), quit: vi.fn() }}
        >
          <div data-zone="tableau:0">
            <button type="button">Select ace</button>
          </div>
          <div data-zone="foundation:spades" data-legal-target>
            <button type="button" onClick={move}>
              Move to spades foundation
            </button>
          </div>
        </TableScreenFrame>,
      ),
    );

    const source = container.querySelector<HTMLButtonElement>('[data-zone="tableau:0"] button')!;
    const target = container.querySelector<HTMLButtonElement>(
      '[data-zone="foundation:spades"] button',
    )!;
    source.focus();
    act(() =>
      source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(document.activeElement).toBe(target);

    act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(move).toHaveBeenCalledOnce();
  });
});

describe('table screen frame convention', () => {
  it('keeps every playable game on the shared shell, HUD, and menu composition', () => {
    const tableRoot = join(process.cwd(), 'src/components/table');
    const screens = [join(tableRoot, 'TableScreen.tsx')];
    for (const entry of readdirSync(tableRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'shell') continue;
      const directory = join(tableRoot, entry.name);
      for (const file of readdirSync(directory)) {
        if (file.endsWith('TableScreen.tsx')) screens.push(join(directory, file));
      }
    }

    expect(screens).toHaveLength(19);
    for (const screen of screens) {
      const source = readFileSync(screen, 'utf8');
      expect(source, screen).toContain('<TableScreenFrame');
      expect(source, screen).not.toContain('<TableShell');
      expect(source, screen).not.toContain('<TableHud');
      expect(source, screen).not.toContain('<TableMenu');
    }
  });
});
