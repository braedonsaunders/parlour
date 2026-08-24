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
