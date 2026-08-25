import { createSession, type GameSession } from '@parlour/engine';
import type { CardId } from '@parlour/engine';
import { spiteConfig, type SpiteRules } from './config';
import { spiteGame } from './game';
import { emptyCentre, type SpiteState } from './state';

export const defaults = spiteConfig.defaults();

/** `card(9)` → '9-0'; `card(9, 3)` → '9-3'. Twelve copies of every rank. */
export function card(rank: number, copy = 0): CardId {
  return `${rank}-${copy}`;
}

/** `wild()` → 'wild-0'. Eighteen in the deck, all identical. */
export function wild(copy = 0): CardId {
  return `wild-${copy}`;
}

/**
 * A session standing on a hand-built state — the same trick Wildpile's tests
 * use, so rules are exercised at exact positions a real deal would take ages
 * to reach.
 */
export function fixture(
  overrides: Partial<SpiteState> = {},
  config: SpiteRules = defaults,
): GameSession<SpiteState, SpiteRules> {
  const seats = overrides.seats ?? 2;
  const base = createSession(spiteGame, { seed: 7, config, seats });
  const state: SpiteState = {
    ...base.state,
    seats,
    discards:
      overrides.discards ??
      Array.from({ length: seats }, () =>
        Array.from({ length: config.discardPiles }, () => [] as CardId[]),
      ),
    centre: overrides.centre ?? Array.from({ length: config.buildPiles }, () => emptyCentre()),
    ...overrides,
  };
  return {
    ...base,
    config,
    state,
    phase: spiteGame.flow.start(state, state.seats),
  };
}
