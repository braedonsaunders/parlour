import { defineConfig, type RuleValues } from '@parlour/engine';

/**
 * Palace house rules. Every field is load-bearing in play and rendered as a
 * room-settings control by the app.
 */
export interface PalaceRules extends RuleValues {
  /** the swap phase between the deal and the first play */
  allowSwap: boolean;
  /** a 2 is playable on anything and resets the pile floor */
  twosReset: boolean;
  /** a 10 is playable on anything and burns the pile; the same seat plays again */
  tensBurn: boolean;
  /** an 8 is always playable and does not change the pile floor */
  eightsBlind: boolean;
  /** four of a kind on top of the pile burns it; the same seat plays again */
  fourKindBurn: boolean;
  /** match ends when a seat banks this many round wins */
  winsTo: number;
}

export const DEFAULT_WINS_TO = 3;
export const MIN_WINS_TO = 1;
export const MAX_WINS_TO = 7;

export const palaceConfig = defineConfig<PalaceRules>(
  [
    { key: 'allowSwap', kind: 'toggle', label: 'Swap before play', default: true },
    { key: 'twosReset', kind: 'toggle', label: '2 resets the pile', default: true },
    { key: 'tensBurn', kind: 'toggle', label: '10 burns the pile', default: true },
    { key: 'eightsBlind', kind: 'toggle', label: '8 is always playable', default: true },
    { key: 'fourKindBurn', kind: 'toggle', label: 'Four of a kind burns', default: true },
    {
      key: 'winsTo',
      kind: 'int',
      label: 'First to (round wins)',
      min: MIN_WINS_TO,
      max: MAX_WINS_TO,
      default: DEFAULT_WINS_TO,
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'quick', label: 'Quick', values: { winsTo: 1 } },
    {
      id: 'chaos',
      label: 'Chaos',
      // Every special stays maxed, but there is no swap phase to plan around —
      // the deal you get is the deal you play.
      values: {
        allowSwap: false,
        twosReset: true,
        tensBurn: true,
        eightsBlind: true,
        fourKindBurn: true,
        winsTo: 3,
      },
    },
  ],
);
