import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppleTouchDevice, suspendsAudioWhenBackgrounded } from './platform';

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

describe('suspendsAudioWhenBackgrounded', () => {
  it('keeps audio alive when a desktop Mac app loses visibility', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(suspendsAudioWhenBackgrounded()).toBe(false);
  });

  it('suspends audio on iOS, iPadOS, and Android devices', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(suspendsAudioWhenBackgrounded()).toBe(true);

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(suspendsAudioWhenBackgrounded()).toBe(true);

    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    expect(suspendsAudioWhenBackgrounded()).toBe(true);
  });
});
