import { act, createElement } from 'react';
import type { HowToPlayDoc } from '@parlour/engine';
import { wildpileHowToPlay } from '@parlour/game-wildpile';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAMES } from '@/lib/games';
import { HowToPlayButton, HowToPlayModal } from './HowToPlay';

const DOC: HowToPlayDoc = {
  summary: 'A tiny demo game.',
  objective: 'Run out of demo cards.',
  sections: [
    { heading: 'Turns', body: ['Play a card.', 'Or draw one.'] },
    { heading: 'Cards', bullets: [{ label: 'Star', text: 'skips the next seat' }] },
  ],
};

describe('HowToPlay', () => {
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

  it('renders the pack doc verbatim — summary, objective, sections and bullets', () => {
    act(() =>
      root.render(
        createElement(HowToPlayModal, { open: true, onClose: vi.fn(), doc: DOC, title: 'Demo' }),
      ),
    );

    const sheet = container.querySelector('[data-testid="how-to-play"]');
    expect(sheet?.textContent).toContain('A tiny demo game.');
    expect(sheet?.textContent).toContain('Run out of demo cards.');
    expect(sheet?.textContent).toContain('Play a card.');
    expect(sheet?.textContent).toContain('Or draw one.');
    expect(sheet?.querySelector('dt')?.textContent).toBe('Star');
    expect(sheet?.querySelector('dd')?.textContent).toBe('skips the next seat');
  });

  it('stays closed until asked, and shuts on the close button, backdrop and Escape', () => {
    const onClose = vi.fn();
    act(() =>
      root.render(createElement(HowToPlayModal, { open: false, onClose, doc: DOC, title: 'Demo' })),
    );
    expect(container.querySelector('[data-testid="how-to-play"]')).toBeNull();

    act(() =>
      root.render(createElement(HowToPlayModal, { open: true, onClose, doc: DOC, title: 'Demo' })),
    );
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="close-how-to-play"]')?.click(),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => container.querySelector<HTMLElement>('[data-testid="how-to-play"]')?.click());
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps a click on the sheet itself from closing it', () => {
    const onClose = vi.fn();
    act(() =>
      root.render(createElement(HowToPlayModal, { open: true, onClose, doc: DOC, title: 'Demo' })),
    );
    act(() => container.querySelector<HTMLElement>('[role="document"]')?.click());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens from the trigger without firing the tile it sits on', () => {
    const onTileClick = vi.fn();
    act(() =>
      root.render(
        createElement(
          'div',
          { onClick: onTileClick },
          createElement(HowToPlayButton, { doc: DOC, title: 'Demo Game', variant: 'chip' }),
        ),
      ),
    );

    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="how-to-play-demo-game"]',
    );
    expect(trigger?.getAttribute('aria-label')).toBe('How to play Demo Game');
    act(() => trigger?.click());

    expect(container.querySelector('[data-testid="how-to-play"]')).not.toBeNull();
    expect(onTileClick).not.toHaveBeenCalled();
  });

  it('gives every shelved game a doc to show', () => {
    for (const game of GAMES) {
      expect(game.howToPlay.summary, game.id).toBeTruthy();
      expect(game.howToPlay.objective, game.id).toBeTruthy();
      expect(game.howToPlay.sections.length, game.id).toBeGreaterThan(0);
    }
    // Wild's doc is the pack's own, not a copy that can drift.
    expect(GAMES.find((game) => game.id === 'wild')?.howToPlay).toBe(wildpileHowToPlay);
  });
});
