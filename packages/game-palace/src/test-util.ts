import { createFx, makeRng, type CardId, type MoveCtx } from '@parlour/engine';
import { palaceConfig, type PalaceRules } from './config';
import type { PalaceState, TopRun } from './state';

export function rules(overrides: Partial<PalaceRules> = {}): PalaceRules {
  return palaceConfig.resolve(overrides);
}

export interface StateSeed {
  hands: CardId[][];
  up?: CardId[][];
  down?: CardId[][];
  pile?: CardId[];
  burn?: CardId[];
  floor?: number | null;
  topRun?: TopRun | null;
  turn?: number | null;
  roundsWon?: number[];
  swapped?: number[];
  readied?: number[];
  veiled?: boolean;
}

/** Hand-built state for move-level unit tests — bypasses a real deal. */
export function state(seed: StateSeed, ruleOverrides: Partial<PalaceRules> = {}): PalaceState {
  const seats = seed.hands.length;
  return {
    seats,
    rules: rules(ruleOverrides),
    roundsWon: seed.roundsWon ?? Array.from({ length: seats }, () => 0),
    round: 0,
    hands: seed.hands.map((cards) => [...cards]),
    up: (seed.up ?? Array.from({ length: seats }, () => [])).map((cards) => [...cards]),
    down: (seed.down ?? Array.from({ length: seats }, () => [])).map((cards) => [...cards]),
    pile: [...(seed.pile ?? [])],
    burn: [...(seed.burn ?? [])],
    floor: seed.floor ?? null,
    topRun: seed.topRun ?? null,
    turn: seed.turn === undefined ? null : seed.turn,
    swapped: seed.swapped ?? [],
    readied: seed.readied ?? Array.from({ length: seats }, (_unused, index) => index),
    roundWinner: null,
    lastOrder: null,
    veiled: seed.veiled ?? false,
  };
}

export function ctx(seq = 0): MoveCtx & { fx: ReturnType<typeof createFx> } {
  return { rng: makeRng(1234).fork(`ev:${seq}`), fx: createFx(), event: { seq } };
}

export function fxKinds(context: { fx: { events: readonly { kind: string }[] } }): string[] {
  return context.fx.events.map((event) => event.kind);
}
