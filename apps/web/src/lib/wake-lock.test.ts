import { describe, expect, it, vi } from 'vitest';
import { keepScreenAwake } from './wake-lock';

type Listener = () => void;

function listenerBag() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, listener: Listener) => {
      const bucket = listeners.get(type) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    fire: (type: string) => {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

type FakeSentinel = {
  release: ReturnType<typeof vi.fn>;
  /** The platform dropping the lock on its own, as a hidden page does. */
  drop: () => void;
};

function fakeDevice({ granted = true, deferred = false } = {}) {
  const documentBag = listenerBag();
  const windowBag = listenerBag();
  const sentinels: FakeSentinel[] = [];
  const pending: Listener[] = [];
  let allow = granted;

  const makeSentinel = () => {
    const bag = listenerBag();
    const sentinel: FakeSentinel = {
      release: vi.fn(async () => bag.fire('release')),
      drop: () => bag.fire('release'),
      ...bag,
    };
    sentinels.push(sentinel);
    return sentinel;
  };

  const request = vi.fn((_type: string) => {
    if (!allow) return Promise.reject(new Error('wake lock denied'));
    const sentinel = makeSentinel();
    if (!deferred) return Promise.resolve(sentinel);
    return new Promise<FakeSentinel>((resolve) => pending.push(() => resolve(sentinel)));
  });

  const documentValue = { visibilityState: 'visible', ...documentBag };
  const windowValue = { document: documentValue, ...windowBag };

  return {
    request,
    sentinels,
    document: documentValue,
    window: windowValue as unknown as Window,
    navigator: { wakeLock: { request } } as unknown as Navigator,
    grantFrom: (next: boolean) => {
      allow = next;
    },
    resolvePending: () => {
      for (const resolve of pending.splice(0)) resolve();
    },
    hide: () => {
      documentValue.visibilityState = 'hidden';
      sentinels.at(-1)?.drop();
      documentBag.fire('visibilitychange');
    },
    show: () => {
      documentValue.visibilityState = 'visible';
      documentBag.fire('visibilitychange');
    },
    touch: () => documentBag.fire('pointerdown'),
    restore: () => windowBag.fire('pageshow'),
    listening: () =>
      documentBag.count('visibilitychange') +
      documentBag.count('pointerdown') +
      windowBag.count('pageshow'),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('keeping the screen awake at a table', () => {
  it('takes a screen lock on the way in and hands it back on the way out', async () => {
    const device = fakeDevice();

    const stop = keepScreenAwake(device.window, device.navigator);
    await settle();

    expect(device.request).toHaveBeenCalledTimes(1);
    expect(device.request).toHaveBeenCalledWith('screen');

    stop();
    await settle();

    expect(device.sentinels[0]!.release).toHaveBeenCalledTimes(1);
    expect(device.listening()).toBe(0);
  });

  it('takes the lock again when the page comes back into view', async () => {
    const device = fakeDevice();

    keepScreenAwake(device.window, device.navigator);
    await settle();

    // Hidden pages lose the lock and cannot ask for another one.
    device.hide();
    await settle();
    expect(device.request).toHaveBeenCalledTimes(1);

    device.show();
    await settle();
    expect(device.request).toHaveBeenCalledTimes(2);
  });

  it('holds one lock at a time', async () => {
    const device = fakeDevice();

    keepScreenAwake(device.window, device.navigator);
    await settle();

    device.show();
    device.touch();
    device.restore();
    await settle();

    expect(device.request).toHaveBeenCalledTimes(1);
  });

  it('deals on through a refusal and retries at the next touch', async () => {
    const device = fakeDevice({ granted: false });

    const stop = keepScreenAwake(device.window, device.navigator);
    await settle();

    expect(device.request).toHaveBeenCalledTimes(1);
    expect(device.sentinels).toHaveLength(0);

    device.grantFrom(true);
    device.touch();
    await settle();

    expect(device.sentinels).toHaveLength(1);
    stop();
    await settle();
    expect(device.sentinels[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that only arrives after the table closed', async () => {
    const device = fakeDevice({ deferred: true });

    const stop = keepScreenAwake(device.window, device.navigator);
    stop();
    device.resolvePending();
    await settle();

    expect(device.sentinels[0]!.release).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a device with no wake lock', () => {
    const device = fakeDevice();

    const stop = keepScreenAwake(device.window, {} as Navigator);

    expect(device.listening()).toBe(0);
    expect(() => stop()).not.toThrow();
  });
});
