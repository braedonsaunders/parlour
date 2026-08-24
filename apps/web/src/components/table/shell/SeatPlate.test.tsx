import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tableStyles from '@/styles/table.module.css';
import { DiscardPileButton, StockPile, TablePiles } from './TablePiles';
import { OpponentFan, SeatNameplate } from './SeatPlate';

describe('OpponentFan', () => {
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

  const rotations = (count: number, max: number, spread: number) => {
    const seen: number[] = [];
    act(() =>
      root.render(
        <OpponentFan
          count={count}
          max={max}
          spread={spread}
          renderCard={({ rotation }) => {
            seen.push(rotation);
            return <i />;
          }}
        />,
      ),
    );
    return seen;
  };

  it('caps the painted backs but announces the seat’s real count', () => {
    const seen = rotations(13, 5, 22);
    expect(seen).toHaveLength(5);
    expect(
      container.querySelector(`.${tableStyles.opponentCards}`)!.getAttribute('aria-label'),
    ).toBe('13 hidden cards');
  });

  it('splays the fan symmetrically across the full spread', () => {
    const seen = rotations(5, 5, 22);
    expect(seen[0]).toBeCloseTo(-11);
    expect(seen[4]).toBeCloseTo(11);
    expect(seen[2]).toBeCloseTo(0);
    expect(seen[4]! - seen[0]!).toBeCloseTo(22);
  });

  it('lays a single back flat and paints nothing for an empty seat', () => {
    expect(rotations(1, 5, 22)).toEqual([0]);
    expect(rotations(0, 5, 22)).toEqual([]);
  });
});

describe('SeatNameplate', () => {
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

  it('marks bots and leaves humans unlabelled', () => {
    act(() => root.render(<SeatNameplate name="Marge" isBot />));
    expect(container.querySelector('strong')!.textContent).toBe('Marge');
    expect(container.querySelector('small')!.textContent).toBe('bot');

    act(() => root.render(<SeatNameplate name="You" />));
    expect(container.querySelector('small')).toBeNull();
  });
});

describe('TablePiles', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    container.remove();
  });

  it('keeps the stock zone, count and draw label the fx planner and readers rely on', () => {
    const onClick = vi.fn();
    act(() =>
      root.render(
        <TablePiles localTurn centerPiles>
          <StockPile count={42} disabled={false} onClick={onClick} card={<i data-back />} />
        </TablePiles>,
      ),
    );

    const piles = container.querySelector<HTMLElement>(`.${tableStyles.piles}`)!;
    expect(piles.getAttribute('data-local-turn')).toBe('true');
    expect(piles.hasAttribute('data-center-piles')).toBe(true);

    const stock = piles.querySelector<HTMLButtonElement>('[data-zone="stock"]')!;
    expect(stock.getAttribute('aria-label')).toBe('Draw from stock, 42 cards remain');
    expect(stock.querySelector(`.${tableStyles.pileCount}`)!.textContent).toBe('42');
    expect(stock.querySelector('[data-back]')).not.toBeNull();
    // Tables that never light the pile up must not publish the attribute at all.
    expect(stock.hasAttribute('data-can-draw')).toBe(false);

    act(() => stock.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('omits the centre marker and disables the discard when it cannot be drawn', () => {
    const onClick = vi.fn();
    act(() =>
      root.render(
        <TablePiles localTurn={false}>
          <DiscardPileButton disabled onClick={onClick} label="Draw from discard">
            <i data-card />
          </DiscardPileButton>
        </TablePiles>,
      ),
    );

    const piles = container.querySelector<HTMLElement>(`.${tableStyles.piles}`)!;
    expect(piles.hasAttribute('data-center-piles')).toBe(false);
    expect(piles.getAttribute('data-local-turn')).toBe('false');

    const discard = piles.querySelector<HTMLButtonElement>('[data-zone="discard"]')!;
    expect(discard.classList.contains(tableStyles.discardPile!)).toBe(true);
    expect(discard.disabled).toBe(true);
    act(() => discard.click());
    expect(onClick).not.toHaveBeenCalled();
  });
});
