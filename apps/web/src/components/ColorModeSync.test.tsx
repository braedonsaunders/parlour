import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_COLOR_MODE,
  DEFAULT_DROP_EFFECTS,
  TABLE_FX_STORAGE_KEY,
  useTableFxStore,
} from '@/stores/tableFx';
import { ColorModeSync } from './ColorModeSync';

describe('ColorModeSync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.colorMode = 'richer';
    useTableFxStore.setState({
      dropEffects: DEFAULT_DROP_EFFECTS,
      appColorMode: DEFAULT_APP_COLOR_MODE,
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete document.documentElement.dataset.colorMode;
  });

  it('syncs the persisted mode without reserving a global keyboard shortcut', () => {
    act(() => root.render(createElement(ColorModeSync)));
    expect(document.documentElement.dataset.colorMode).toBe('richer');

    act(() => useTableFxStore.getState().setAppColorMode('original'));
    expect(document.documentElement.dataset.colorMode).toBe('original');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })));
    expect(document.documentElement.dataset.colorMode).toBe('original');
    expect(JSON.parse(localStorage.getItem(TABLE_FX_STORAGE_KEY)!).state.appColorMode).toBe(
      'original',
    );
  });

  it('makes richer the default for clients carrying the comparison version', async () => {
    localStorage.setItem(
      TABLE_FX_STORAGE_KEY,
      JSON.stringify({
        state: { dropEffects: 'full', appColorMode: 'original' },
        version: 3,
      }),
    );

    await act(async () => useTableFxStore.persist.rehydrate());
    act(() => root.render(createElement(ColorModeSync)));

    expect(useTableFxStore.getState().appColorMode).toBe('richer');
    expect(document.documentElement.dataset.colorMode).toBe('richer');
  });
});
