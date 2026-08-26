import { createSession, type LegalMove } from '@parlour/engine';
import { freecellConfig, type FreecellRules } from './config';
import { freecellGame } from './game';
import { solveFreecell, type SolveOptions } from './solver';
import type { FreecellState } from './state';

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
  /** Winning line for the returned seed, empty unless `winnable` is true. */
  line: readonly LegalMove[];
}

const DEFAULT_MAX_CANDIDATES = 12;

/** Deals the table a given seed produces, without running a whole match. */
export function freecellDealFor(seed: number, freeCells: 4 | 6): FreecellState {
  return createSession(freecellGame, {
    seed,
    config: freecellConfig.resolve({ freeCells } as Partial<FreecellRules>),
    seats: 1,
  }).state;
}

/**
 * Successive candidates from one starting seed. Same mixing step as Klondike's:
 * neighbouring seeds are not neighbouring shuffles, and a weak step function
 * would correlate the candidates into a run of dead deals.
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
 * Pure and deterministic, so the same date and rules give every player the
 * same table without anything being coordinated — same contract as Klondike's
 * {@link findWinnableSeed}, and the same proviso: the deals it picks depend
 * on the solver's behaviour, so treat the tuning as part of this contract.
 */
export function findWinnableSeed(
  startSeed: number,
  freeCells: 4 | 6,
  options: WinnableSearchOptions = {},
): WinnableSeed {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  let seed = startSeed | 0;
  for (let rejected = 0; rejected < maxCandidates; rejected++) {
    const solved = solveFreecell(freecellDealFor(seed, freeCells), options);
    if (solved.outcome === 'solved') {
      return { seed, rejected, winnable: true, line: solved.line };
    }
    seed = nextCandidate(seed);
  }
  return { seed: startSeed | 0, rejected: maxCandidates, winnable: false, line: [] };
}
