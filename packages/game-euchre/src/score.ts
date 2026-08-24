import type { EuchreState, HandScoreReason, HandSummary } from './state';

/**
 * Traditional euchre scoring (brief-locked): makers taking 3–4 tricks earn 1,
 * all five is a march worth 2 — 4 when the caller went alone — and euchring
 * the makers is 2 to the defenders.
 */
export function scoreHand(summary: Pick<HandSummary, 'makerTricks' | 'alone'>): {
  makerPoints: number;
  defenderPoints: number;
  reason: HandScoreReason;
} {
  if (summary.makerTricks < 3) return { makerPoints: 0, defenderPoints: 2, reason: 'euchred' };
  if (summary.makerTricks === 5) {
    return summary.alone
      ? { makerPoints: 4, defenderPoints: 0, reason: 'march-alone' }
      : { makerPoints: 2, defenderPoints: 0, reason: 'march' };
  }
  return { makerPoints: 1, defenderPoints: 0, reason: 'taken' };
}

export function tricksByTeam(state: EuchreState): [number, number] {
  const caller = state.caller;
  if (caller === null) return [0, state.trickWinners.length];
  let makerTricks = 0;
  for (const seat of state.trickWinners) if (seat % 2 === caller % 2) makerTricks += 1;
  const defenderTricks = state.trickWinners.length - makerTricks;
  return [makerTricks, defenderTricks];
}
