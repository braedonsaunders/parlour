import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import modeStyles from '@/styles/modes.module.css';
import BlitzSetupPage from '@/app/play/page';
import CribbageSetupPage from '@/app/cribbage/page';
import EightsSetupPage from '@/app/eights/page';
import EuchreSetupPage from '@/app/euchre/page';
import GinSetupPage from '@/app/gin/page';
import HeartsSetupPage from '@/app/hearts/page';
import GolfSetupPage from '@/app/golf/page';
import KlondikeSetupPage from '@/app/klondike/page';
import OhHellSetupPage from '@/app/ohhell/page';
import PokerSetupPage from '@/app/poker/page';
import ScopaSetupPage from '@/app/scopa/page';
import SpiteSetupPage from '@/app/spite/page';
import PresidentSetupPage from '@/app/president/page';
import RatscrewSetupPage from '@/app/ratscrew/page';
import SpadesSetupPage from '@/app/spades/page';
import WildSetupPage from '@/app/wild/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => '/',
}));

vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

/**
 * The frame every pre-game screen must keep.
 *
 * Ten of these pages once framed themselves as a plain document starting at
 * `pt-5`, which on an iPhone in portrait puts "← Games" underneath the status
 * bar with nothing to tap. Blitz was the one page on the fixed app frame, and
 * the one page that worked. This is the test that stops the shelf drifting
 * apart again: whatever a game puts in its footer, the screen it puts it in is
 * `GameSetupScreen`, and the header allows for the phone's own chrome.
 */
const SETUP_PAGES: readonly [string, ComponentType][] = [
  ['Blitz', BlitzSetupPage],
  ['Cribbage', CribbageSetupPage],
  ['Crazy Eights', EightsSetupPage],
  ['Euchre', EuchreSetupPage],
  ['Gin', GinSetupPage],
  ['Hearts', HeartsSetupPage],
  ['Golf', GolfSetupPage],
  ['Klondike', KlondikeSetupPage],
  ['Oh Hell', OhHellSetupPage],
  ['Poker', PokerSetupPage],
  ['President', PresidentSetupPage],
  ['Rat Screw', RatscrewSetupPage],
  ['Scopa', ScopaSetupPage],
  ['Spades', SpadesSetupPage],
  ['Spite & Malice', SpiteSetupPage],
  ['Wild', WildSetupPage],
];

describe('setup screen contract across every shipped game', () => {
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

  const render = (Page: ComponentType) => act(() => root.render(createElement(Page)));

  it.each(SETUP_PAGES)('%s sits in the shared screen frame', (_name, Page) => {
    render(Page);

    const main = container.querySelector('main')!;
    expect(main.classList.contains(modeStyles.fitScreen!)).toBe(true);
    // The old shape, and the one that broke: a document taller than the fold
    // whose header pads by a fixed amount.
    expect(main.className).not.toContain('min-h-dvh');

    const header = container.querySelector(`.${modeStyles.fitHeader}`);
    expect(header).not.toBeNull();
    expect(container.querySelector(`.${modeStyles.fitFooter}`)).not.toBeNull();
  });

  it.each(SETUP_PAGES)('%s keeps the way back reachable in the header', (_name, Page) => {
    render(Page);

    const header = container.querySelector(`.${modeStyles.fitHeader}`)!;
    const back = header.querySelector<HTMLAnchorElement>('a[href="/games"]');
    expect(back).not.toBeNull();
    // First in the header, so the safe-area padding above it is the only thing
    // between the link and the top of the window.
    expect(header.firstElementChild).toBe(back);
  });

  it.each(SETUP_PAGES)('%s presents its modes in the horizontal carousel', (_name, Page) => {
    render(Page);

    const carousel = container.querySelector<HTMLElement>('[role="radiogroup"]')!;
    expect(carousel).not.toBeNull();
    for (const style of [
      modeStyles.carousel,
      modeStyles.centeredCarousel,
      modeStyles.fitCarousel,
    ]) {
      expect(carousel.classList.contains(style!)).toBe(true);
    }
    // Solitaire used to stack its three deals down the page on a phone; every
    // game's modes now scroll sideways in the same rail.
    expect(carousel.getAttribute('aria-label')).toBeTruthy();
    expect(carousel.querySelectorAll('[role="radio"]').length).toBeGreaterThan(1);
    expect(carousel.querySelectorAll(`.${modeStyles.tile}`).length).toBe(
      carousel.querySelectorAll('[role="radio"]').length,
    );
  });

  it.each(SETUP_PAGES)('%s marks exactly one mode as chosen', (_name, Page) => {
    render(Page);

    const chosen = container.querySelectorAll('[role="radio"][aria-checked="true"]');
    expect(chosen).toHaveLength(1);
  });
});
