import { beforeEach, describe, expect, it } from 'vitest';
import { SETUP_DB_STORAGE_KEY, useGameSetupDb } from './gameSetup';
import { useHeartsSetupStore, HEARTS_SETUP_STORAGE_KEY } from './heartsSetup';
import { usePresidentSetupStore, PRESIDENT_SETUP_STORAGE_KEY } from './presidentSetup';
import { useWildSetupStore, WILD_SETUP_STORAGE_KEY } from './wildSetup';

/**
 * A setup store's whole job across a reload: give back the table the player set
 * up, and never give back one the game cannot deal. Wild covers the seated
 * shape, President a different seat ring and default, Hearts the fixed-seat
 * shape that only remembers a mode and a bot tier.
 *
 * All three now live in one store, so these also cover the thing that only
 * became possible when they did: one game's document must not disturb another's.
 */

function store(key: string, state: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify({ state, version: 1 }));
}

function documents(): Record<string, Record<string, unknown>> {
  const written = JSON.parse(localStorage.getItem(SETUP_DB_STORAGE_KEY) ?? '{}');
  return written.state?.docs ?? {};
}

describe('solo setup persistence', () => {
  beforeEach(async () => {
    localStorage.clear();
    await useGameSetupDb.persist.rehydrate();
  });

  it('writes the picked table into that game’s document', () => {
    useWildSetupStore.getState().setSeats(2);
    useWildSetupStore.getState().setMode('classic');
    useWildSetupStore.getState().setBotTier(3);

    expect(documents().wild).toMatchObject({ mode: 'classic', seats: 2, botTier: 3 });
    // Actions are not state; persisting them would store `null` over the store.
    expect(documents().wild).not.toHaveProperty('setSeats');
  });

  /**
   * The whole reason there is one store: a game is a key in a document bag, so
   * two of them cannot reach each other, and adding a third writes no new key.
   */
  it('keeps each game’s document to itself', () => {
    useWildSetupStore.getState().setSeats(2);
    usePresidentSetupStore.getState().setSeats(8);

    expect(documents().wild).toMatchObject({ seats: 2 });
    expect(documents().president).toMatchObject({ seats: 8 });
    expect(useWildSetupStore.getState().seats).toBe(2);
    expect(usePresidentSetupStore.getState().seats).toBe(8);
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

describe('upgrading from a store per game', () => {
  beforeEach(async () => {
    localStorage.clear();
    await useGameSetupDb.persist.rehydrate();
  });

  /**
   * Every one of these tests reads a key written by the previous release. That
   * is not a fixture convenience — it is the upgrade path, and a player who set
   * Wild to two seats last week must not come back to four.
   */
  it('adopts a table left under the old per-game key', async () => {
    store(WILD_SETUP_STORAGE_KEY, { mode: 'classic', seats: 3, botTier: 1 });
    await useWildSetupStore.persist.rehydrate();

    expect(useWildSetupStore.getState()).toMatchObject({ mode: 'classic', seats: 3, botTier: 1 });
  });

  /**
   * The old key is read and never written, so downgrading to a release that
   * still reads it does not strand anybody on defaults.
   */
  it('leaves the old key alone', async () => {
    const legacy = { mode: 'classic', seats: 3, botTier: 1 };
    store(WILD_SETUP_STORAGE_KEY, legacy);
    await useWildSetupStore.persist.rehydrate();
    useWildSetupStore.getState().setSeats(2);

    expect(JSON.parse(localStorage.getItem(WILD_SETUP_STORAGE_KEY) ?? '{}').state).toEqual(legacy);
    expect(documents().wild).toMatchObject({ seats: 2 });
  });

  /** A document under the one store is what the player last chose; it wins. */
  it('prefers the one store over a stale legacy key', async () => {
    store(WILD_SETUP_STORAGE_KEY, { mode: 'classic', seats: 3 });
    localStorage.setItem(
      SETUP_DB_STORAGE_KEY,
      JSON.stringify({ state: { docs: { wild: { mode: 'party', seats: 2 } } }, version: 1 }),
    );
    await useGameSetupDb.persist.rehydrate();

    expect(useWildSetupStore.getState()).toMatchObject({ mode: 'party', seats: 2 });
  });
});
