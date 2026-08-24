/**
 * The knobs personas turn. Every tier bot reads the same scorer; a persona is
 * just a skew of these weights, which keeps "distinct discard discipline"
 * comparable across characters instead of six bespoke code paths.
 */
export interface BotParams {
  /** how much playing the payoff top outweighs any other play */
  payoffDrive: number;
  /** points charged against spending a wild out of your own hand */
  wildHold: number;
  /** appetite for stacking a discard so a descending run waits under it */
  runKeep: number;
  /** points docked for leaving a centre pile exactly where the next seat wants it */
  blockAwareness: number;
  /** random jitter sprinkled over scores — the sound of human inconsistency */
  noise: number;
}

export const EASY_PARAMS: BotParams = {
  payoffDrive: 0,
  wildHold: 0,
  runKeep: 0,
  blockAwareness: 0,
  noise: 0,
};

/** Sensible middle: chases the payoff, tidies its discards, spends wilds freely. */
export const MEDIUM_PARAMS: BotParams = {
  payoffDrive: 45,
  wildHold: 18,
  runKeep: 4,
  blockAwareness: 0,
  noise: 3,
};

/**
 * Plays the table: hoards wilds for the payoff chain and builds discard runs.
 *
 * `blockAwareness` is deliberately zero, and that is a measured result rather
 * than an oversight. Docking a play for leaving a centre pile where the next
 * seat wants it *costs* Hard about five points of win rate against Easy
 * (62.7% -> 67.3% over 300 seat-swapped games): the plays it declines are
 * usually its own payoff progress, and in a race to empty a payoff pile your
 * own tempo is worth more than a rival's inconvenience.
 *
 * The knob stays on `BotParams` because personas still skew it — a character
 * who plays spitefully is a legitimate temperament, just not the strongest one.
 *
 * `wildHold` at 90 is also measured: dropping it to zero costs *sixteen*
 * points (67.3% -> 51.3%), so holding a wild until it unblocks the payoff chain
 * is the single most valuable habit Hard has.
 */
export const HARD_PARAMS: BotParams = {
  payoffDrive: 60,
  wildHold: 90,
  runKeep: 16,
  blockAwareness: 0,
  noise: 1,
};
