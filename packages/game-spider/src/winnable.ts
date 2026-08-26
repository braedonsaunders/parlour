import type { LegalMove } from '@parlour/engine';
import type { SpiderSuitCount } from './cards';
import { solveSpider, spiderDealFor, type SolveOptions, type SolveResult } from './solver';
import type { SpiderState } from './state';

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

/**
 * Successive candidates from one starting seed. Same mixing step as
 * Klondike's and FreeCell's: neighbouring seeds are not neighbouring
 * shuffles, and a weak step function would correlate the candidates into a
 * run of dead deals.
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
 * The measured proof rates (see the report that shipped `solver.ts`) decide
 * how much of this is a promise and how much is a filter: at one suit almost
 * every deal solves, at four suits nearly none of them prove inside the
 * node budget, and the finder answers `winnable: false` rather than guess.
 */
export function findWinnableSeed(
  startSeed: number,
  suitCount: SpiderSuitCount,
  options: WinnableSearchOptions = {},
): WinnableSeed {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  let seed = startSeed | 0;
  for (let rejected = 0; rejected < maxCandidates; rejected++) {
    const solved: SolveResult = solveSpider(spiderDealFor(seed, suitCount), options);
    if (solved.outcome === 'solved') {
      return { seed, rejected, winnable: true, line: solved.line };
    }
    seed = nextCandidate(seed);
  }
  return { seed: startSeed | 0, rejected: maxCandidates, winnable: false, line: [] };
}

export type { SolveOptions, SolveResult, SolveOutcome } from './solver';

export function spiderDealState(seed: number, suitCount: SpiderSuitCount): SpiderState {
  return spiderDealFor(seed, suitCount);
}
