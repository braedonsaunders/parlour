import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileStore } from '@/stores/profile';
import { TableCountdown } from './TableCountdown';

describe('TableCountdown', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    act(() => useProfileStore.getState().updateSettings({ reducedMotion: false }));
  });

  it('counts three beats into the deal call and then leaves the felt alone', () => {
    act(() => root.render(createElement(TableCountdown)));
    const digit = () => container.querySelector('[data-testid="table-countdown"]')?.textContent;

    expect(digit()).toBe('3');
    act(() => void vi.advanceTimersByTime(800));
    expect(digit()).toBe('2');
    act(() => void vi.advanceTimersByTime(800));
    expect(digit()).toBe('1');
    act(() => void vi.advanceTimersByTime(800));
    expect(digit()).toBe('Deal!');
    act(() => void vi.advanceTimersByTime(700));
    expect(container.querySelector('[data-testid="table-countdown"]')).toBeNull();
  });

  it('never flashes for a calm-motion player', () => {
    act(() => useProfileStore.getState().updateSettings({ reducedMotion: true }));
    act(() => root.render(createElement(TableCountdown)));
    expect(container.querySelector('[data-testid="table-countdown"]')).toBeNull();
  });
});
