import { describe, expect, it, vi } from 'vitest';
import { recoverPwa, type PwaRecoveryRuntime } from './pwaRecovery';

describe('PWA recovery', () => {
  it('removes only Parlour state before reloading the same page', async () => {
    const unregisterParlour = vi.fn(async () => true);
    const unregisterOther = vi.fn(async () => true);
    const deleteCache = vi.fn(async (_key: string) => true);
    const reload = vi.fn();
    const runtime: PwaRecoveryRuntime = {
      registrations: async () => [
        { active: { scriptURL: 'https://parlour.cards/sw.js' }, unregister: unregisterParlour },
        { active: { scriptURL: 'https://example.com/worker.js' }, unregister: unregisterOther },
      ],
      cacheKeys: async () => ['parlour-precache-old', 'parlour-runtime-old', 'unrelated-cache'],
      deleteCache,
      reload,
    };

    await recoverPwa(runtime);

    expect(unregisterParlour).toHaveBeenCalledTimes(1);
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(deleteCache.mock.calls.map(([key]) => key)).toEqual([
      'parlour-precache-old',
      'parlour-runtime-old',
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
