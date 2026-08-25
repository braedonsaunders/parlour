import { isStandaloneDisplay } from '@/lib/pwa';

export const MENU_HISTORY_KEY = 'parlourMenu';

type MenuHistoryState = {
  [MENU_HISTORY_KEY]?: string;
};

function appleTouch(navigatorValue: Navigator): boolean {
  const ua = navigatorValue.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1;
}

/** iOS home-screen PWAs treat a real URL change as a document load and kill audio. */
export function freezesMenuDocument(
  windowValue: Window | undefined = typeof window === 'undefined' ? undefined : window,
  navigatorValue: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): boolean {
  if (!windowValue || !navigatorValue) return false;
  return appleTouch(navigatorValue) && isStandaloneDisplay(windowValue, navigatorValue);
}

export function readFrozenMenuPath(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const path = (state as MenuHistoryState)[MENU_HISTORY_KEY];
  return typeof path === 'string' ? path : null;
}

function withMenuPath(state: unknown, path: string): MenuHistoryState {
  const base = state && typeof state === 'object' ? (state as MenuHistoryState) : {};
  return { ...base, [MENU_HISTORY_KEY]: path };
}

/** Grow a same-document history stack so Back still works without changing the URL. */
export function pushFrozenMenu(target: string, previous: string): void {
  if (typeof window === 'undefined') return;
  if (readFrozenMenuPath(window.history.state) === null) {
    window.history.replaceState(withMenuPath(window.history.state, previous), '');
  }
  window.history.pushState(withMenuPath(window.history.state, target), '');
}
