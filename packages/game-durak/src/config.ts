import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface DurakRules {
  /** Perevodnoy: a defender who has not yet beaten a card may pass the bout on. */
  transfer: boolean;
  /** Podkidnoy: attacking seats may throw in more cards matching a rank on the table. */
  throwIns: boolean;
  /** Never more than this many attack cards land on a defender in one bout. */
  maxAttacks: number;
  /** Seats refill their hand up to this many cards after every bout. */
  refillTo: number;
  /** Heads-up house rule: the first hand to empty wins immediately, stock or not. */
  instantWin: boolean;
  [key: string]: ConfigFieldValue;
}

export const durakConfig = defineConfig<DurakRules>(
  [
    {
      key: 'transfer',
      kind: 'toggle',
      label: 'Transfer (perevodnoy)',
      default: false,
      group: 'The bout',
      help: 'A defender holding a matching rank may pass the whole attack to the next seat instead of beating it.',
    },
    {
      key: 'throwIns',
      kind: 'toggle',
      label: 'Throw-ins (podkidnoy)',
      default: true,
      group: 'The bout',
      help: 'Any attacking seat may add more cards that match a rank already on the table.',
    },
    {
      key: 'maxAttacks',
      kind: 'int',
      label: 'Attack limit',
      min: 4,
      max: 6,
      default: 6,
      group: 'The bout',
      help: 'The most attack cards a defender can be shown in one bout.',
    },
    {
      key: 'refillTo',
      kind: 'int',
      label: 'Hand size',
      min: 4,
      max: 6,
      default: 6,
      group: 'The deal',
      help: 'Cards dealt at the start, and the size every hand refills to after a bout.',
    },
    {
      key: 'instantWin',
      kind: 'toggle',
      label: 'Instant win',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'The first hand to empty wins on the spot, even if the stock still has cards.',
    },
  ],
  [
    {
      id: 'classic',
      label: 'Classic Durak',
      values: {
        transfer: false,
        throwIns: true,
        maxAttacks: 6,
        refillTo: 6,
        instantWin: false,
      },
    },
    {
      id: 'transfer',
      label: 'Perevodnoy',
      values: {
        transfer: true,
        throwIns: true,
        maxAttacks: 6,
        refillTo: 6,
        instantWin: false,
      },
    },
    {
      id: 'heads-up',
      label: 'Heads-Up',
      values: {
        transfer: false,
        throwIns: true,
        maxAttacks: 6,
        refillTo: 6,
        instantWin: true,
      },
    },
  ],
);
