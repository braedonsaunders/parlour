import { createSession } from '@parlour/engine';
import { klondikeConfig, type KlondikeRules } from './config';
import { klondikeGame } from './game';
import { isWinnableDeal, type SolveOptions } from './solver';
import type { KlondikeState } from './state';

export interface WinnableSearchOptions extends SolveOptions {
  /** How many candidate seeds to try before giving up. */
  maxCandidates?: number;
}

export interface WinnableSeed {
  /** The seed to deal from — proven winnable when `winnable` is true. */
  seed: number;
  /** How many candidates were rejected before this one. */
  rejected: number;
  /** False when the search ran out of candidates and fell back to the first seed. */
  winnable: boolean;
}

const DEFAULT_MAX_CANDIDATES = 12;

/** Deals the table a given seed produces, without running a whole match. */
export function klondikeDealFor(seed: number, drawCount: 1 | 3): KlondikeState {
  return createSession(klondikeGame, {
    seed,
    config: klondikeConfig.resolve({ drawCount } as Partial<KlondikeRules>),
    seats: 1,
  }).state;
}

/**
 * Successive candidates from one starting seed. Mixing rather than incrementing
 * matters: neighbouring seeds are not neighbouring shuffles, but a weak step
 * function would still correlate the candidates and could walk a whole run of
 * dead deals together.
 */
function nextCandidate(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) | 0;
}

/**
 * Walks candidate seeds from `startSeed` until the solver proves one winnable.
 *
 * Pure and deterministic, so the same date and rules give every player the same
 * table without anything being coordinated. That does tie the answer to the
 * solver's behaviour: changing the search would re-roll the deals it picks, so
 * treat the tuning in `solver.ts` as part of this contract.
 */
export function findWinnableSeed(
  startSeed: number,
  drawCount: 1 | 3,
  options: WinnableSearchOptions = {},
): WinnableSeed {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  let seed = startSeed | 0;
  for (let rejected = 0; rejected < maxCandidates; rejected++) {
    if (isWinnableDeal(klondikeDealFor(seed, drawCount), { ...options, drawCount })) {
      return { seed, rejected, winnable: true };
    }
    seed = nextCandidate(seed);
  }
  // Every candidate came up short. Dealing the original beats dealing nothing,
  // and the caller can tell the player the guarantee did not hold.
  return { seed: startSeed | 0, rejected: maxCandidates, winnable: false };
}
