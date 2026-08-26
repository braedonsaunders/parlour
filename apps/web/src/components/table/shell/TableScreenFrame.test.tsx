import { createElement } from 'react';
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
        createElement(
          TableScreenFrame,
          {
            rootRef: { current: null },
            hud: createElement('span', { 'data-testid': 'hud-copy' }, 'Round one'),
            menu: { isOpen: false, open, close: vi.fn(), quit: vi.fn() },
          },
          createElement('section', { 'data-testid': 'felt-copy' }, 'Felt'),
        ),
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
