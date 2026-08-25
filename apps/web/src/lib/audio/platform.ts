/**
 * iPhone, iPod, and iPadOS (including desktop-class iPad). Those browsers
 * suspend Web Audio on standalone PWA navigations and only allow one HTML5
 * media element at a time.
 */
export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}
