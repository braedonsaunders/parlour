import { beforeEach, describe, expect, it } from 'vitest';
import { useHeartsSetupStore, HEARTS_SETUP_STORAGE_KEY } from './heartsSetup';
import { usePresidentSetupStore, PRESIDENT_SETUP_STORAGE_KEY } from './presidentSetup';
import { useWildSetupStore, WILD_SETUP_STORAGE_KEY } from './wildSetup';

/**
 * A setup store's whole job across a reload: give back the table the player set
 * up, and never give back one the game cannot deal. Wild covers the seated
 * shape, President a different seat ring and default, Hearts the fixed-seat
 * shape that only remembers a mode and a bot tier.
 */

function store(key: string, state: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify({ state, version: 1 }));
}

describe('solo setup persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes the picked table to local storage', async () => {
    useWildSetupStore.getState().setSeats(2);
    useWildSetupStore.getState().setMode('classic');
    useWildSetupStore.getState().setBotTier(3);

    const written = JSON.parse(localStorage.getItem(WILD_SETUP_STORAGE_KEY) ?? '{}');
    expect(written.state).toMatchObject({ mode: 'classic', seats: 2, botTier: 3 });
    // Actions are not state; persisting them would store `null` over the store.
    expect(written.state).not.toHaveProperty('setSeats');
  });

  it('deals the seat count the player left behind, not the default', async () => {
    store(WILD_SETUP_STORAGE_KEY, { mode: 'party', seats: 2, botTier: 1, overrides: {} });
    await useWildSetupStore.persist.rehydrate();

    expect(useWildSetupStore.getState()).toMatchObject({ mode: 'party', seats: 2, botTier: 1 });
  });

  it('keeps rule knobs turned by hand', async () => {
    store(WILD_SETUP_STORAGE_KEY, { mode: 'houseRules', overrides: { turnTimeSeconds: 45 } });
    await useWildSetupStore.persist.rehydrate();

    expect(useWildSetupStore.getState().overrides).toEqual({ turnTimeSeconds: 45 });
  });

  it('refuses a stored table the game could not deal', async () => {
    store(WILD_SETUP_STORAGE_KEY, {
      mode: 'roulette',
      seats: 9,
      botTier: 42,
      overrides: ['not an object'],
    });
    await useWildSetupStore.persist.rehydrate();

    expect(useWildSetupStore.getState()).toMatchObject({
      mode: 'party',
      seats: 4,
      botTier: 2,
      overrides: {},
    });
  });

  it('falls back to the game default when a field was never stored', async () => {
    store(PRESIDENT_SETUP_STORAGE_KEY, { mode: 'classic' });
    await usePresidentSetupStore.persist.rehydrate();

    // President seats five by default and never fewer than four.
    expect(usePresidentSetupStore.getState()).toMatchObject({ seats: 5, botTier: 2 });
  });

  it('remembers mode and bots for a game with no seat picker', async () => {
    store(HEARTS_SETUP_STORAGE_KEY, { mode: 'cutthroat', botTier: 3 });
    await useHeartsSetupStore.persist.rehydrate();

    expect(useHeartsSetupStore.getState()).toMatchObject({
      mode: 'cutthroat',
      botTier: 3,
    });
    expect(useHeartsSetupStore.getState()).not.toHaveProperty('seats');
  });
});
