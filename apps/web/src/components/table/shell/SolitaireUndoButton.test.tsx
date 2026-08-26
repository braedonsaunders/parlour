import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocaleStore } from '@/stores/locale';
import { SolitaireUndoButton } from './SolitaireUndoButton';

describe('SolitaireUndoButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en', chosen: false });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows real undo presses in a focusable control and disables it at zero', () => {
    const onUndo = vi.fn();
    act(() => root.render(<SolitaireUndoButton depth={3} testId="undo" onUndo={onUndo} />));

    const button = container.querySelector<HTMLButtonElement>('[data-testid="undo"]')!;
    expect(button.textContent).toBe('Undo · 3 moves');
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    act(() => button.click());
    expect(onUndo).toHaveBeenCalledOnce();

    act(() => root.render(<SolitaireUndoButton depth={0} testId="undo" onUndo={onUndo} />));
    expect(button.textContent).toBe('Undo · 0 moves');
    expect(button.disabled).toBe(true);
  });
});
