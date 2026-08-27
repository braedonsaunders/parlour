'use client';

import { defineSetup, type SetupStore } from '@/stores/gameSetup';
import { clampBotTier, type BotTier } from '@/stores/setup';
import { storedOverrides } from '@/stores/setupPersistence';

/**
 * The four shapes a game's setup actually takes, over the one store.
 *
 * Nineteen setup stores turned out to be four ideas:
 *
 *   mode + bots                     Euchre, Spades
 *   mode + bots + rule overrides    Cribbage, Gin, Hearts
 *   mode + bots + seats             Oh Hell, Poker, Scopa, Spite, Blitz
 *   mode + bots + seats + overrides Crazy Eights, President, Rat Screw, Wild
 *
 * plus the solitaires, which keep a mode and a live deal and no bots at all.
 *
 * They are four helpers rather than one with optional fields because the
 * absence of a field is load-bearing: Hearts seats exactly four and must NOT
 * carry a seat count, or a seat picker appears for a game that has none and a
 * stored `seats` starts overriding the rules. A shape you can only get by
 * asking for it is a shape nobody gets by accident.
 */

const OVERRIDES_DROP_ON_MODE_CHANGE =
  'Switching preset drops per-knob overrides: the tile you picked is the table.';

export type ModeSetup<M extends string> = {
  mode: M;
  botTier: BotTier;
  setMode: (mode: string) => void;
  setBotTier: (tier: number) => void;
};

export type RulesSetup<M extends string, R extends object> = ModeSetup<M> & {
  /** Per-key overrides layered on top of the selected mode's preset. */
  overrides: Partial<R>;
  setRule: (key: string, value: R[keyof R & string]) => void;
  resetRules: () => void;
};

export type SeatedSetup<M extends string, S extends number = number> = ModeSetup<M> & {
  seats: S;
  setSeats: (seats: number) => void;
};

export type SeatedRulesSetup<
  M extends string,
  R extends object,
  S extends number = number,
> = SeatedSetup<M, S> & Omit<RulesSetup<M, R>, keyof ModeSetup<M>>;

type ModeOptions<M extends string> = {
  gameId: string;
  defaultMode: M;
  isMode: (value: unknown) => value is M;
};

type SeatOptions<S extends number> = {
  defaultSeats: S;
  clampSeats: (value: number) => S;
};

/** Mode and bot difficulty, and nothing else. */
export function defineModeSetup<M extends string>(
  options: ModeOptions<M>,
): SetupStore<ModeSetup<M>> {
  return defineSetup<{ mode: M; botTier: BotTier }, Omit<ModeSetup<M>, 'mode' | 'botTier'>>(
    options.gameId,
    {
      defaults: { mode: options.defaultMode, botTier: 2 },
      coerce: (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
        botTier: clampBotTier(Number(stored.botTier)),
      }),
    },
    (setup) => ({
      setMode: (mode) => {
        if (options.isMode(mode)) setup.patch({ mode });
      },
      setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) }),
    }),
  ) as SetupStore<ModeSetup<M>>;
}

/** Mode, bots, and a bag of hand-turned rule knobs. */
export function defineRulesSetup<M extends string, R extends object>(
  options: ModeOptions<M>,
): SetupStore<RulesSetup<M, R>> {
  type Doc = { mode: M; botTier: BotTier; overrides: Partial<R> };
  return defineSetup<Doc, Omit<RulesSetup<M, R>, keyof Doc>>(
    options.gameId,
    {
      defaults: { mode: options.defaultMode, botTier: 2, overrides: {} },
      coerce: (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
        botTier: clampBotTier(Number(stored.botTier)),
        overrides: storedOverrides<R>(stored.overrides),
      }),
    },
    (setup) => ({
      // See OVERRIDES_DROP_ON_MODE_CHANGE.
      setMode: (mode) => {
        if (options.isMode(mode)) setup.patch({ mode, overrides: {} } as Partial<Doc>);
      },
      setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) } as Partial<Doc>),
      setRule: (key, value) =>
        setup.patch({
          overrides: { ...setup.get().overrides, [key]: value } as Partial<R>,
        } as Partial<Doc>),
      resetRules: () => setup.patch({ overrides: {} } as Partial<Doc>),
    }),
  ) as SetupStore<RulesSetup<M, R>>;
}

/** Mode, bots, and how many chairs. */
export function defineSeatedSetup<M extends string, S extends number = number>(
  options: ModeOptions<M> & SeatOptions<S>,
): SetupStore<SeatedSetup<M, S>> {
  type Doc = { mode: M; botTier: BotTier; seats: S };
  return defineSetup<Doc, Omit<SeatedSetup<M, S>, keyof Doc>>(
    options.gameId,
    {
      defaults: { mode: options.defaultMode, botTier: 2, seats: options.defaultSeats },
      coerce: (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
        botTier: clampBotTier(Number(stored.botTier)),
        seats: options.clampSeats(Number(stored.seats)),
      }),
    },
    (setup) => ({
      setMode: (mode) => {
        if (options.isMode(mode)) setup.patch({ mode } as Partial<Doc>);
      },
      setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) } as Partial<Doc>),
      setSeats: (seats) => setup.patch({ seats: options.clampSeats(seats) } as Partial<Doc>),
    }),
  ) as SetupStore<SeatedSetup<M, S>>;
}

/** All of it: mode, bots, chairs and hand-turned rules. */
export function defineSeatedRulesSetup<
  M extends string,
  R extends object,
  S extends number = number,
>(options: ModeOptions<M> & SeatOptions<S>): SetupStore<SeatedRulesSetup<M, R, S>> {
  type Doc = { mode: M; botTier: BotTier; seats: S; overrides: Partial<R> };
  return defineSetup<Doc, Omit<SeatedRulesSetup<M, R, S>, keyof Doc>>(
    options.gameId,
    {
      defaults: {
        mode: options.defaultMode,
        botTier: 2,
        seats: options.defaultSeats,
        overrides: {},
      },
      coerce: (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
        botTier: clampBotTier(Number(stored.botTier)),
        seats: options.clampSeats(Number(stored.seats)),
        overrides: storedOverrides<R>(stored.overrides),
      }),
    },
    (setup) => ({
      // See OVERRIDES_DROP_ON_MODE_CHANGE.
      setMode: (mode) => {
        if (options.isMode(mode)) setup.patch({ mode, overrides: {} } as Partial<Doc>);
      },
      setBotTier: (tier) => setup.patch({ botTier: clampBotTier(tier) } as Partial<Doc>),
      setSeats: (seats) => setup.patch({ seats: options.clampSeats(seats) } as Partial<Doc>),
      setRule: (key, value) =>
        setup.patch({
          overrides: { ...setup.get().overrides, [key]: value } as Partial<R>,
        } as Partial<Doc>),
      resetRules: () => setup.patch({ overrides: {} } as Partial<Doc>),
    }),
  ) as SetupStore<SeatedRulesSetup<M, R, S>>;
}

/** A solitaire: which mode, and the deal currently on the table. */
export type SolitaireSetup<M extends string, Run extends { mode: M }, Opts = never> = {
  mode: M;
  run: Run | null;
  setMode: (mode: M) => void;
  start: (mode: M, options?: Opts) => Run;
  replaceRun: (run: Run) => void;
};

export function defineSolitaireSetup<
  M extends string,
  Run extends { mode: M },
  Opts = never,
>(options: {
  gameId: string;
  defaultMode: M;
  isMode: (value: unknown) => value is M;
  makeRun: (mode: M, runOptions?: Opts) => Run;
}): SetupStore<SolitaireSetup<M, Run, Opts>> {
  return defineSetup<{ mode: M }, Omit<SolitaireSetup<M, Run, Opts>, 'mode' | 'run'>, Run>(
    options.gameId,
    {
      defaults: { mode: options.defaultMode },
      coerce: (stored) => ({
        mode: options.isMode(stored.mode) ? stored.mode : options.defaultMode,
      }),
    },
    (setup) => ({
      setMode: (mode) => setup.patch({ mode }),
      start: (mode, runOptions) => {
        const run = options.makeRun(mode, runOptions);
        setup.patch({ mode });
        setup.putRun(run);
        return run;
      },
      replaceRun: (run) => {
        setup.patch({ mode: run.mode });
        setup.putRun(run);
      },
    }),
  ) as SetupStore<SolitaireSetup<M, Run, Opts>>;
}

export { OVERRIDES_DROP_ON_MODE_CHANGE };
