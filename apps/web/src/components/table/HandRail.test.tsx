import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculateFanStep, HandRail, HandRailCard } from './HandRail';

const styles = readFileSync(join(process.cwd(), 'src/styles/table.module.css'), 'utf8');

function declarationsFor(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} exists`).not.toBeNull();
  return match![1]!;
}

describe('calculateFanStep', () => {
  it('keeps UNO-like overlap for an ordinary seven-card hand', () => {
    expect(calculateFanStep(390, 82, 7)).toBeCloseTo(39.36);
  });

  it('compresses even forty-card hands enough to remain inside the edge gutters', () => {
    const width = 390;
    const cardWidth = 115.2;
    const count = 40;
    const step = calculateFanStep(width, cardWidth, count);
    const occupiedWidth = cardWidth + step * (count - 1);

    expect(occupiedWidth).toBeLessThanOrEqual(width - 40);
    expect(step).toBeGreaterThan(0);
  });

  it('centers a one-card hand without an offset', () => {
    expect(calculateFanStep(390, 82, 1)).toBe(0);
  });

  it('puts pointer hit-testing on each transformed card instead of its centered wrapper', () => {
    expect(declarationsFor('.handCard')).toMatch(/pointer-events:\s*none;/);
    expect(declarationsFor('.localHand .card')).toMatch(/pointer-events:\s*auto;/);
  });

  it('hides an arriving fan card so the flyer can become it', () => {
    expect(declarationsFor('.handCard[data-arriving] .card')).toMatch(/opacity:\s*0;/);
  });

  it('hides a departing fan card so the discard flyer can leave from its slot', () => {
    expect(declarationsFor('.handCard[data-departing] .card')).toMatch(/opacity:\s*0;/);
  });

  it('eases the fan open without the pop curve while a card is coming in', () => {
    expect(declarationsFor('.localHand[data-receiving] .handFan')).toMatch(
      /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/,
    );
    expect(declarationsFor('.localHand[data-receiving] .handFan')).not.toMatch(/ease-pop/);
  });
});

describe('hand rail keyboard surface', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps list semantics and exposes one enabled card as the hand entry point', () => {
    act(() => {
      root.render(
        <HandRail count={2} zone="hand:0" label="Your hand">
          <HandRailCard cardId="S1" index={0} count={2} playable>
            <button type="button" aria-label="Discard ace of spades">
              A♠
            </button>
          </HandRailCard>
          <HandRailCard cardId="H2" index={1} count={2} playable={false}>
            <button type="button" disabled aria-label="2 of hearts">
              2♥
            </button>
          </HandRailCard>
        </HandRail>,
      );
    });

    const rail = container.querySelector('[role="list"]');
    expect(rail?.getAttribute('aria-label')).toBe('Your hand');
    expect(rail?.getAttribute('tabindex')).toBeNull();
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2);

    const playableItem = container.querySelector('[data-hand-card][data-playable="true"]');
    expect(playableItem?.getAttribute('data-card-id')).toBe('S1');
    expect(playableItem?.getAttribute('data-flight-target')).toBe('S1');
    expect(playableItem?.querySelector('[data-hand-fan]')).not.toBeNull();
    expect(playableItem?.getAttribute('tabindex')).toBeNull();
    expect(playableItem?.tagName).not.toBe('BUTTON');

    const tabStops = [...container.querySelectorAll('button, [tabindex]')].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.getAttribute('disabled') !== null) return false;
      const tabIndex = node.getAttribute('tabindex');
      return tabIndex !== '-1';
    });
    expect(tabStops).toHaveLength(1);
    expect(tabStops[0]?.tagName).toBe('BUTTON');
    expect(tabStops[0]?.getAttribute('aria-label')).toBe('Discard ace of spades');
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Discard ace of spades"]')?.tabIndex,
    ).toBe(0);
  });

  it('holds a thirteen-card hand as one fan, with nothing to scroll', () => {
    act(() => {
      root.render(
        <HandRail count={13} zone="hand:0" label="Your hand">
          {Array.from({ length: 13 }, (_, index) => (
            <HandRailCard key={index} cardId={`card-${index}`} index={index} count={13} playable>
              <button type="button">Card {index + 1}</button>
            </HandRailCard>
          ))}
        </HandRail>,
      );
    });

    const rail = container.querySelector<HTMLElement>('[role="list"]')!;
    expect(rail.querySelectorAll('[role="listitem"]')).toHaveLength(13);
    // A scroll container, a scroll cue or a scroll-state attribute would each
    // mean some part of the hand is off-screen. The owner's rule is that the
    // fan compresses instead: every card visible, in one look, always.
    expect(rail.querySelector('[data-hand-scroll]')).toBeNull();
    expect(rail.querySelectorAll('[data-scroll-cue]')).toHaveLength(0);
    expect(rail.dataset.scrollState).toBeUndefined();
  });

  it('re-solves the fan step when the device rotates', () => {
    act(() => {
      root.render(
        <HandRail count={7} zone="hand:0" label="Your hand">
          {Array.from({ length: 7 }, (_, index) => (
            <HandRailCard key={index} cardId={`card-${index}`} index={index} count={7} playable>
              <button type="button">Card {index + 1}</button>
            </HandRailCard>
          ))}
        </HandRail>,
      );
    });

    const rail = container.querySelector<HTMLElement>('[role="list"]')!;
    const firstCard = rail.querySelector<HTMLElement>('[data-hand-card]')!;
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 390 });
    Object.defineProperty(firstCard, 'offsetWidth', { configurable: true, value: 70 });
    act(() => window.dispatchEvent(new Event('resize')));
    const portraitStep = rail.style.getPropertyValue('--fan-step');

    // Landscape is both a wider rail and a bigger card; the step must follow
    // both or the hand lands at the previous orientation's spacing.
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 820 });
    Object.defineProperty(firstCard, 'offsetWidth', { configurable: true, value: 115 });
    act(() => window.dispatchEvent(new Event('orientationchange')));

    expect(rail.style.getPropertyValue('--fan-step')).not.toBe(portraitStep);
    expect(Number.parseFloat(rail.style.getPropertyValue('--fan-step'))).toBeGreaterThan(
      Number.parseFloat(portraitStep),
    );
  });
});

describe('portrait hands', () => {
  const portrait = (() => {
    const start = styles.indexOf('@media (orientation: portrait) {');
    expect(start, 'portrait block exists').toBeGreaterThan(-1);
    let depth = 0;
    for (let index = styles.indexOf('{', start); index < styles.length; index += 1) {
      if (styles[index] === '{') depth += 1;
      if (styles[index] === '}') {
        depth -= 1;
        if (depth === 0) return styles.slice(start, index + 1);
      }
    }
    throw new Error('unterminated portrait block');
  })();

  /*
   * These four assertions are the ones that were missing. A previous batch
   * turned portrait into a horizontally scrolling row with `overflow-y: hidden`,
   * which cut the top off every lifted playable card and hid nine of thirteen
   * cards behind a swipe — and it rewrote the tests that would have caught it.
   * The owner's requirement predates that change and still stands: the deck is
   * compressed so it never scrolls, while only the non-readable lower half is
   * allowed to pass behind the viewport edge.
   */
  it('never turns the hand into something that scrolls', () => {
    expect(portrait).not.toMatch(/overflow-x:\s*auto/);
    expect(portrait).not.toMatch(/scroll-snap-type/);
  });

  it('never clips the rail, because a lifted playable card has to go somewhere', () => {
    expect(portrait).not.toMatch(/overflow-y:\s*hidden/);
  });

  it('keeps the fan transform rather than flattening the hand into a row', () => {
    expect(portrait).not.toMatch(/transform:\s*none\s*!important/);
    expect(portrait).not.toMatch(/\.handFan\s*\{[^}]*transform:\s*translateY/s);
  });

  it('keeps a full deck-sized card and sinks its lower half behind the screen edge', () => {
    expect(portrait).toMatch(/--hand-card-width:\s*7\.2rem/);
    expect(portrait).toMatch(/bottom:\s*-6rem/);
  });
});

describe('the hand belongs to the shared rail', () => {
  const GAME_STYLESHEETS = readdirSync(join(process.cwd(), 'src/styles')).filter(
    (file) => file.endsWith('.module.css') && file !== 'table.module.css',
  );

  it('solves the rail width from the card count rather than a fixed number', () => {
    // The count is what makes a hand hard. A rail that ignores it collapses
    // thirteen cards to slivers, which is what sent one game off to size its
    // own — and left the other twelve with the problem.
    expect(declarationsFor('.localHand')).toMatch(/--hand-rail-span:[^;]*var\(--fan-n\)/);
    expect(declarationsFor('.localHand')).toMatch(
      /width:\s*min\(var\(--hand-rail-span\),\s*var\(--hand-rail-max\)\)/,
    );
  });

  it('uses a larger desktop card and holds it from below the viewport', () => {
    expect(declarationsFor('.localHand')).toMatch(
      /--hand-card-width:\s*clamp\(8\.6rem,\s*12\.5vw,\s*11\.2rem\)/,
    );
    expect(declarationsFor('.localHand')).toMatch(/bottom:\s*-4rem/);
  });

  /*
   * A new game should get the fan, the spacing and the arc for free. Every one
   * of these knobs is a shared decision, so a game stylesheet that sets one has
   * started a second implementation of the hand — and the two will drift, which
   * is exactly how Spades came to expose 44px of each card while Hearts, with
   * the same thirteen, exposed 38px. Reading these is fine and expected.
   */
  it.each(GAME_STYLESHEETS)('%s does not size the hand itself', (file) => {
    const css = readFileSync(join(process.cwd(), 'src/styles', file), 'utf8');
    const handRules = [...css.matchAll(/\[data-zone\^='hand:'\][^{]*\{([^}]*)\}/g)].map(
      (match) => match[1]!,
    );

    for (const rule of handRules) {
      expect(rule, `${file} sets the shared card width`).not.toMatch(/--hand-card-width:/);
      expect(rule, `${file} sets the shared rail width`).not.toMatch(/--hand-rail-/);
      expect(rule, `${file} sets the shared rail's own width`).not.toMatch(/[^-]width:/);
    }
    expect(css, `${file} restyles a shared hand card`).not.toMatch(/\[data-hand-card\][^{]*\{/);
    expect(css, `${file} restyles the shared fan`).not.toMatch(/\[data-hand-fan\][^{]*\{/);
  });
});

describe('table chrome', () => {
  it('keeps status and primary game actions in opposing bottom thumb zones', () => {
    expect(declarationsFor('.screen')).toMatch(/min-height:\s*min\(420px,\s*100dvh\);/);
    expect(declarationsFor('.screen')).toMatch(/height:\s*var\(--app-height, 100dvh\);/);
    expect(declarationsFor('.ownerStatusRail')).toMatch(/left:[^;]+;/);
    expect(declarationsFor('.ownerStatusRail')).toMatch(/bottom:[^;]+;/);
    expect(declarationsFor('.actionRail')).toMatch(/right:[^;]+;/);
    expect(declarationsFor('.actionRail')).toMatch(/bottom:[^;]+;/);
    expect(declarationsFor('.actionRail')).not.toMatch(/\btop\s*:/);
    expect(declarationsFor('.actionRail button')).toMatch(/min-height:\s*2\.75rem;/);
  });
});
