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

/** iOS standalone PWAs leave a dead strip below `100dvh`; use the real window height. */
export function syncAppViewportHeight(
  windowValue: Window = window,
  navigatorValue: Navigator = navigator,
): () => void {
  const root = windowValue.document.documentElement;
  let frame = 0;
  let timer = 0;

  const apply = () => {
    if (!isStandaloneDisplay(windowValue, navigatorValue)) {
      root.style.removeProperty('--app-height');
      return;
    }
    root.style.setProperty('--app-height', `${windowValue.innerHeight}px`);
  };

  const applyAfterLayout = () => {
    apply();
    windowValue.cancelAnimationFrame(frame);
    windowValue.clearTimeout(timer);
    frame = windowValue.requestAnimationFrame(apply);
    timer = windowValue.setTimeout(apply, 250);
  };

  apply();
  windowValue.addEventListener('resize', applyAfterLayout);
  windowValue.addEventListener('orientationchange', applyAfterLayout);
  windowValue.visualViewport?.addEventListener('resize', applyAfterLayout);
  return () => {
    windowValue.cancelAnimationFrame(frame);
    windowValue.clearTimeout(timer);
    windowValue.removeEventListener('resize', applyAfterLayout);
    windowValue.removeEventListener('orientationchange', applyAfterLayout);
    windowValue.visualViewport?.removeEventListener('resize', applyAfterLayout);
    root.style.removeProperty('--app-height');
  };
}
