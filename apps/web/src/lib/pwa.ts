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
