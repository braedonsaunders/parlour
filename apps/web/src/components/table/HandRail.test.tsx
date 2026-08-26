import { readFileSync } from 'node:fs';
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

  it('compresses large hands enough to remain inside the edge gutters', () => {
    const width = 390;
    const cardWidth = 82;
    const count = 20;
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

  it('keeps list semantics and exposes one keyboard entry point for the whole hand', () => {
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
    expect((rail as HTMLElement | null)?.tabIndex).toBe(0);
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
    expect(tabStops[0]).toBe(rail);
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Discard ace of spades"]')?.tabIndex,
    ).toBe(-1);
  });

  it('marks a long hand as scrollable and tracks both reachable ends', () => {
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
    const track = rail.querySelector<HTMLElement>('[data-hand-scroll]')!;
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 960 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });

    act(() => window.dispatchEvent(new Event('resize')));
    expect(rail.dataset.scrollState).toBe('start');
    expect(rail.querySelectorAll('[data-scroll-cue]')).toHaveLength(2);

    act(() => {
      track.scrollLeft = 320;
      track.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(rail.dataset.scrollState).toBe('middle');

    act(() => {
      track.scrollLeft = 640;
      track.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    expect(rail.dataset.scrollState).toBe('end');
    expect(rail.querySelectorAll('[role="listitem"]')).toHaveLength(13);
  });

  it('starts at the first card when a dealt hand first becomes scrollable', () => {
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
    const track = rail.querySelector<HTMLElement>('[data-hand-scroll]')!;
    Object.defineProperties(track, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 320, writable: true },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    act(() => window.dispatchEvent(new Event('resize')));
    expect(rail.dataset.scrollState).toBe('none');

    // WebKit can carry this stale centred offset across the underflow/overflow
    // layout change while the thirteen cards arrive.
    Object.defineProperty(track, 'scrollWidth', { configurable: true, value: 960 });
    track.scrollLeft = 640;
    act(() => window.dispatchEvent(new Event('resize')));

    expect(track.scrollLeft).toBe(0);
    expect(rail.dataset.scrollState).toBe('start');
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
