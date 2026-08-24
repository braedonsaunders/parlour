export type InstallPlatform = 'android' | 'ios' | 'other';

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function getInstallPlatform(navigatorValue: Navigator): InstallPlatform {
  const userAgent = navigatorValue.userAgent;
  const isIPadDesktopMode =
    navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktopMode) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

export function isStandaloneDisplay(
  windowValue: Window = window,
  navigatorValue: Navigator = navigator,
): boolean {
  const standaloneNavigator = navigatorValue as NavigatorWithStandalone;
  return (
    standaloneNavigator.standalone === true ||
    windowValue.matchMedia?.('(display-mode: standalone)').matches === true ||
    windowValue.matchMedia?.('(display-mode: fullscreen)').matches === true
  );
}

export function isTauriRuntime(windowValue: Window = window): boolean {
  const tauriWindow = windowValue as TauriWindow;
  return (
    tauriWindow.__TAURI_INTERNALS__ !== undefined ||
    windowValue.location.protocol === 'tauri:' ||
    windowValue.location.protocol === 'asset:' ||
    windowValue.location.hostname === 'tauri.localhost'
  );
}

/**
 * iOS standalone PWAs leave a dead strip below `100dvh`; publish the real window
 * height so `--app-height` can take the taller of the two. The launch animation
 * can report a short window for a beat, so this re-measures on the way in.
 */
export function syncAppViewportHeight(
  windowValue: Window = window,
  navigatorValue: Navigator = navigator,
): () => void {
  const root = windowValue.document.documentElement;
  const settleDelays = [0, 250, 1000];
  let frame = 0;
  let timers: number[] = [];

  const apply = () => {
    if (!isStandaloneDisplay(windowValue, navigatorValue)) {
      root.style.removeProperty('--app-window-height');
      return;
    }
    // Rotating shrinks the window, so each measurement stands on its own rather
    // than ratcheting up to the tallest height ever seen.
    const height = Math.max(windowValue.innerHeight, windowValue.visualViewport?.height ?? 0);
    root.style.setProperty('--app-window-height', `${Math.round(height)}px`);
  };

  const clearPending = () => {
    windowValue.cancelAnimationFrame(frame);
    for (const timer of timers) windowValue.clearTimeout(timer);
    timers = [];
  };

  const applyAfterLayout = () => {
    apply();
    clearPending();
    frame = windowValue.requestAnimationFrame(apply);
    timers = settleDelays.map((delay) => windowValue.setTimeout(apply, delay));
  };

  applyAfterLayout();
  windowValue.addEventListener('resize', applyAfterLayout);
  windowValue.addEventListener('orientationchange', applyAfterLayout);
  windowValue.addEventListener('pageshow', applyAfterLayout);
  windowValue.visualViewport?.addEventListener('resize', applyAfterLayout);
  return () => {
    clearPending();
    windowValue.removeEventListener('resize', applyAfterLayout);
    windowValue.removeEventListener('orientationchange', applyAfterLayout);
    windowValue.removeEventListener('pageshow', applyAfterLayout);
    windowValue.visualViewport?.removeEventListener('resize', applyAfterLayout);
    root.style.removeProperty('--app-window-height');
  };
}
