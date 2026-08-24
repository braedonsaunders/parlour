'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export function centerSelectedCarouselItem(carousel: HTMLElement, behavior: ScrollBehavior): void {
  const selected = carousel.querySelector<HTMLElement>("[data-selected='true']");
  if (!selected) return;

  const carouselRect = carousel.getBoundingClientRect();
  const selectedRect = selected.getBoundingClientRect();
  const selectedCenter =
    selectedRect.left - carouselRect.left + carousel.scrollLeft + selectedRect.width / 2;

  carousel.scrollTo({
    left: selectedCenter - carousel.clientWidth / 2,
    behavior,
  });
}

export function useCenteredCarousel(selectedKey: string) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const hasCentered = useRef(false);

  const centerSelected = useCallback((behavior: ScrollBehavior) => {
    if (carouselRef.current) centerSelectedCarouselItem(carouselRef.current, behavior);
  }, []);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    centerSelected(hasCentered.current && !reduceMotion ? 'smooth' : 'auto');
    hasCentered.current = true;
  }, [centerSelected, selectedKey]);

  useEffect(() => {
    let frame = 0;
    const recenter = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => centerSelected('auto'));
    };

    window.addEventListener('resize', recenter);
    return () => {
      window.removeEventListener('resize', recenter);
      window.cancelAnimationFrame(frame);
    };
  }, [centerSelected]);

  return carouselRef;
}
