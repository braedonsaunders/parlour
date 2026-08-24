export interface BotParams {
  /** starter samples behind the discard EV (0 = myopic keep scoring) */
  readonly starterSamples: number;
  /** weight of the crib direction on the throw */
  readonly cribWeight: number;
  /** legacy caution knob for the low-tier pegging path */
  readonly caution: number;
  /** simulated opponent replies per candidate play (0 = none) */
  readonly replySamples: number;
  /** penalty scale for plays an opponent can punish */
  readonly trapWeight: number;
  /** reward for plays that force a go out of the opponent */
  readonly goPressure: number;
  /** probability of remembering to bank muggins points */
  readonly claimRate: number;
  /** probability of grabbing a free muggins steal */
  readonly stealRate: number;
}

export const EASY_PARAMS: BotParams = {
  starterSamples: 12,
  cribWeight: 0.5,
  caution: 0.2,
  replySamples: 0,
  trapWeight: 0,
  goPressure: 0,
  claimRate: 0.55,
  stealRate: 0.5,
};

export const MEDIUM_PARAMS: BotParams = {
  starterSamples: 16,
  cribWeight: 1,
  caution: 0.9,
  replySamples: 8,
  trapWeight: 1,
  goPressure: 0.7,
  claimRate: 0.97,
  stealRate: 0.9,
};

export const HARD_PARAMS: BotParams = {
  starterSamples: 36,
  cribWeight: 1.6,
  caution: 1.4,
  replySamples: 16,
  trapWeight: 2,
  goPressure: 1.1,
  claimRate: 1,
  stealRate: 1,
};
