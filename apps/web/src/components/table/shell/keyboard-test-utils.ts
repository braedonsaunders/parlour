import { act } from 'react';

export function pressTableKey(control: HTMLElement, key: string): void {
  act(() => {
    control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

export function activateTableControl(control: HTMLElement): void {
  act(() => control.focus());
  pressTableKey(control, 'Enter');
}

export function moveTableFocusTo(target: HTMLElement): void {
  for (let step = 0; step < 200; step += 1) {
    if (document.activeElement === target) return;
    const current = document.activeElement;
    if (!(current instanceof HTMLElement)) break;
    pressTableKey(current, 'ArrowRight');
  }
  throw new Error(
    `Arrow-key navigation did not reach ${target.getAttribute('aria-label') ?? target.tagName}`,
  );
}
