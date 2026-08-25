import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppleTouchDevice } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isAppleTouchDevice', () => {
  it('is false in a desktop browser', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isAppleTouchDevice()).toBe(false);
  });

  it('is true on iPhone and iPadOS', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(isAppleTouchDevice()).toBe(true);

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isAppleTouchDevice()).toBe(true);
  });
});
