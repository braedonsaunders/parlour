import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import gameStyles from '@/styles/games.module.css';
import modeStyles from '@/styles/modes.module.css';
import EuchreSetupPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/euchre',
}));

// The table wipe is presentational and holds the navigation for its own beat;
// these tests are about where the buttons go. `runTableWipe.test.ts` owns the
// timing.
vi.mock('@/lib/transitions/runTableWipe', () => ({
  runTableWipe: (nav: () => void) => nav(),
}));

describe('Euchre setup page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    useEuchreSetupStore.setState({ mode: 'classic' });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders every mode with the animated card art declared by the Euchre pack', () => {
    act(() => root.render(createElement(EuchreSetupPage)));

    const previews = [...container.querySelectorAll(`.${modeStyles.preview}`)];
    expect(previews).toHaveLength(4);
    expect(
      previews.every(
        (preview) =>
          preview.querySelectorAll(`.${gameStyles.fanCard}, .${gameStyles.wildCard}`).length >= 2,
      ),
    ).toBe(true);
  });
});
