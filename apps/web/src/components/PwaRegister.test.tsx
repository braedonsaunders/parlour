import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocaleStore } from '@/stores/locale';
import { PwaRegister } from './PwaRegister';

vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname }));

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

describe('PwaRegister', () => {
  it('announces offline play without blocking the app', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => root.render(createElement(PwaRegister)));

    const status = container.querySelector('[data-testid="pwa-offline-status"]');
    expect(status?.textContent).toContain('Playing offline');
    expect(status?.textContent).toContain('solo games still work');

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event('online')));
    expect(container.querySelector('[data-testid="pwa-offline-status"]')).toBeNull();
  });

  it('announces offline play in the selected language', async () => {
    useLocaleStore.setState({ locale: 'zh', chosen: true });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => root.render(createElement(PwaRegister)));

    expect(container.querySelector('[data-testid="pwa-offline-status"]')?.textContent).toContain(
      '正在离线游玩',
    );
    expect(container.querySelector('[data-testid="pwa-offline-status"]')?.textContent).toContain(
      '单人游戏仍可使用',
    );
  });
});
