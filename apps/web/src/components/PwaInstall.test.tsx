import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstall } from './PwaInstall';

let container: HTMLDivElement;
let root: Root;
let standalone = false;

function setNavigator(userAgent: string, platform = '', maxTouchPoints = 0) {
  Object.defineProperties(navigator, {
    userAgent: { configurable: true, value: userAgent },
    platform: { configurable: true, value: platform },
    maxTouchPoints: { configurable: true, value: maxTouchPoints },
  });
}

async function renderInstall() {
  await act(async () => root.render(createElement(PwaInstall)));
}

beforeEach(() => {
  standalone = false;
  setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('PwaInstall', () => {
  it('shows clear iOS home-screen instructions and closes them with Escape', async () => {
    setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5);
    await renderInstall();

    const install = container.querySelector<HTMLButtonElement>('[data-testid="pwa-install"]');
    expect(install?.textContent).toContain('Add to Home Screen');

    act(() => install?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Tap Share in your browser toolbar',
    );

    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    act(() => window.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close install instructions');

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('uses the native Android install prompt and hides after acceptance', async () => {
    setNavigator('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36');
    await renderInstall();

    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => window.dispatchEvent(installEvent));
    const install = container.querySelector<HTMLButtonElement>('[data-testid="pwa-install"]');
    expect(install?.textContent).toContain('Install app');

    await act(async () => install?.click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="pwa-install"]')).toBeNull();
  });

  it('stays hidden in standalone and Tauri runtimes', async () => {
    setNavigator('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'iPad', 5);
    standalone = true;
    await renderInstall();
    expect(container.querySelector('[data-testid="pwa-install"]')).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    standalone = false;
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    await renderInstall();
    expect(container.querySelector('[data-testid="pwa-install"]')).toBeNull();
  });
});
