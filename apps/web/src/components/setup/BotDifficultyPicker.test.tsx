import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotDifficultyPicker } from './BotDifficultyPicker';

describe('BotDifficultyPicker', () => {
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

  it('offers the same three tiers and reports a selection', () => {
    const onChange = vi.fn();
    act(() => root.render(createElement(BotDifficultyPicker, { value: 2, onChange })));

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Easy', 'Medium', 'Hard']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);

    act(() => buttons[2]?.click());
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
