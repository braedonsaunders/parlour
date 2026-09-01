import { describe, expect, it, vi } from 'vitest';
import { centerSelectedCarouselItem } from './useCenteredCarousel';

describe('centerSelectedCarouselItem', () => {
  it('scrolls the selected item to the horizontal center of its carousel', () => {
    const carousel = document.createElement('div');
    const first = document.createElement('button');
    const selected = document.createElement('button');
    selected.dataset.selected = 'true';
    carousel.append(first, selected);

    Object.defineProperties(carousel, {
      clientWidth: { value: 390 },
      scrollLeft: { value: 40 },
    });
    carousel.getBoundingClientRect = vi.fn(() => makeRect(10, 390));
    selected.getBoundingClientRect = vi.fn(() => makeRect(372, 336));
    carousel.scrollTo = vi.fn();

    centerSelectedCarouselItem(carousel, 'smooth');

    expect(carousel.scrollTo).toHaveBeenCalledWith({ left: 375, behavior: 'smooth' });
  });

  it('scrolls a vertically overflowing carousel on its vertical axis instead', () => {
    const carousel = document.createElement('div');
    const selected = document.createElement('button');
    selected.dataset.selected = 'true';
    carousel.append(selected);

    Object.defineProperties(carousel, {
      clientWidth: { value: 390 },
      clientHeight: { value: 345 },
      scrollHeight: { value: 1000 },
      scrollTop: { value: 20 },
    });
    carousel.getBoundingClientRect = vi.fn(() => makeRect(0, 390));
    selected.getBoundingClientRect = vi.fn(() => ({ ...makeRect(0, 390), top: 400, height: 180 }));
    carousel.scrollTo = vi.fn();

    centerSelectedCarouselItem(carousel, 'auto');

    // 400 - 0 + 20 + 90 = 510 center; 510 - 345/2 = 337.5
    expect(carousel.scrollTo).toHaveBeenCalledWith({ top: 337.5, behavior: 'auto' });
  });

  it('does nothing when no item is selected', () => {
    const carousel = document.createElement('div');
    carousel.scrollTo = vi.fn();

    centerSelectedCarouselItem(carousel, 'auto');

    expect(carousel.scrollTo).not.toHaveBeenCalled();
  });
});

function makeRect(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + width,
    bottom: 100,
    width,
    height: 100,
    toJSON: () => ({}),
  };
}
