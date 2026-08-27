import { beforeEach, describe, expect, it } from 'vitest';
import { defineSetup, SETUP_DB_STORAGE_KEY, useGameSetupDb } from './gameSetup';

/**
 * The store's own contract, tested through a game that does not exist.
 *
 * Deliberately not through a real game: what is being checked here is that a
 * document of ANY shape survives, is coerced on the way in, and cannot reach
 * another game's document. Using Wild for that would test Wild.
 */

type Doc = { flavour: string; count: number };

const gadget = defineSetup<Doc, { setFlavour: (flavour: string) => void }>(
  'gadget',
  {
    defaults: { flavour: 'plain', count: 1 },
    coerce: (stored) => ({
      flavour: typeof stored.flavour === 'string' ? stored.flavour : 'plain',
      count: Number.isInteger(stored.count) ? (stored.count as number) : 1,
    }),
  },
  (setup) => ({ setFlavour: (flavour) => setup.patch({ flavour }) }),
);

const widget = defineSetup<{ colour: string }, { setColour: (colour: string) => void }>(
  'widget',
  {
    defaults: { colour: 'red' },
    coerce: (stored) => ({
      colour: typeof stored.colour === 'string' ? stored.colour : 'red',
    }),
  },
  (setup) => ({ setColour: (colour) => setup.patch({ colour }) }),
);

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETUP_DB_STORAGE_KEY) ?? '{}').state?.docs ?? {};
}

describe('the setup store', () => {
  beforeEach(async () => {
    localStorage.clear();
    await useGameSetupDb.persist.rehydrate();
  });

  it('gives a game its defaults before anything is written', () => {
    expect(gadget.getState()).toMatchObject({ flavour: 'plain', count: 1 });
  });

  it('keeps two games in separate documents under one key', () => {
    gadget.getState().setFlavour('smoked');
    widget.getState().setColour('blue');

    expect(stored()).toMatchObject({ gadget: { flavour: 'smoked' }, widget: { colour: 'blue' } });
    expect(
      Object.keys(JSON.parse(localStorage.getItem(SETUP_DB_STORAGE_KEY) ?? '{}').state),
    ).toEqual(['docs']);
  });

  /**
   * The document is opaque to the store and meaningful only to its game, which
   * is the whole point — but that means the schema is the only thing standing
   * between a hand-edited localStorage entry and a screen rendering nonsense.
   */
  it('coerces what it reads, not only what it is given', async () => {
    localStorage.setItem(
      SETUP_DB_STORAGE_KEY,
      JSON.stringify({ state: { docs: { gadget: { flavour: 42, count: 'lots' } } }, version: 1 }),
    );
    await useGameSetupDb.persist.rehydrate();

    expect(gadget.getState()).toMatchObject({ flavour: 'plain', count: 1 });
  });

  it('coerces on write too, so a bad value cannot be stored in the first place', () => {
    gadget.setState({ count: 2.5 } as Partial<Doc>);
    expect(gadget.getState().count).toBe(1);
  });

  /**
   * A selector reaching for an action must get the same function every render,
   * or every screen holding one re-renders forever.
   */
  it('hands back a stable action between reads', () => {
    const first = gadget.getState().setFlavour;
    gadget.getState().setFlavour('oak');
    expect(gadget.getState().setFlavour).toBe(first);
  });

  it('does not persist a live run', () => {
    gadget.getState().setFlavour('oak');
    useGameSetupDb.getState().putRun('gadget', { id: 'deal-1' });

    expect(gadget.getState().run).toMatchObject({ id: 'deal-1' });
    expect(stored().gadget).toMatchObject({ flavour: 'oak' });
    expect(stored().gadget).not.toHaveProperty('run');
  });

  /**
   * A game this build has never heard of must keep its document. Downgrading,
   * or a game coming back to the shelf, should not cost somebody their setup.
   */
  it('leaves a document belonging to no known game alone', async () => {
    localStorage.setItem(
      SETUP_DB_STORAGE_KEY,
      JSON.stringify({ state: { docs: { fromTheFuture: { seats: 9 } } }, version: 1 }),
    );
    await useGameSetupDb.persist.rehydrate();
    gadget.getState().setFlavour('smoked');

    expect(stored().fromTheFuture).toEqual({ seats: 9 });
  });
});
