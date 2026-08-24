import { defineConfig, type ConfigFieldValue } from '@parlour/engine';

export interface EightsRules {
  /** Cards dealt to each seat. */
  handSize: number;
  /** Points that end the match. The leader across it takes the crown. */
  targetScore: number;
  /** Twos make the next seat pick up two. */
  twosDrawTwo: boolean;
  /** Queens step over the next seat. */
  queensSkip: boolean;
  /** Aces turn the table around; head-to-head they land as a skip. */
  acesReverse: boolean;
  /** Answer a two with a two and pass the growing pickup along. */
  stackDrawTwo: boolean;
  /** Keep drawing until something is playable instead of drawing exactly one. */
  drawUntilPlayable: boolean;
  /** A drawn card that can be played must be played. */
  forcePlay: boolean;
  [key: string]: ConfigFieldValue;
}

export const eightsConfig = defineConfig<EightsRules>(
  [
    {
      key: 'handSize',
      kind: 'int',
      label: 'Cards dealt',
      min: 5,
      max: 8,
      default: 7,
      group: 'The deal',
      // The ceiling is what one pack can actually deal six seats and still
      // leave a pile to turn up. See `dealRound`.
      help: 'How many cards each seat starts a round with.',
    },
    {
      key: 'targetScore',
      kind: 'int',
      label: 'Play to',
      min: 25,
      max: 500,
      default: 100,
      group: 'The deal',
      help: 'Rounds keep dealing until someone crosses this score.',
    },
    {
      key: 'twosDrawTwo',
      kind: 'toggle',
      label: 'Twos draw two',
      default: true,
      group: 'Action cards',
      help: 'The next seat picks up two and loses the turn.',
    },
    {
      key: 'queensSkip',
      kind: 'toggle',
      label: 'Queens skip',
      default: true,
      group: 'Action cards',
      help: 'Play steps straight over the next seat.',
    },
    {
      key: 'acesReverse',
      kind: 'toggle',
      label: 'Aces reverse',
      default: true,
      group: 'Action cards',
      help: 'Turns the table around. With two players it lands as a skip.',
    },
    {
      key: 'stackDrawTwo',
      kind: 'toggle',
      label: 'Stack twos',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'Answer a two with your own and hand the whole pickup along.',
    },
    {
      key: 'drawUntilPlayable',
      kind: 'toggle',
      label: 'Draw until playable',
      default: true,
      advanced: true,
      group: 'House rules',
      help: 'The traditional rule. Turn it off to draw exactly one card a turn.',
    },
    {
      key: 'forcePlay',
      kind: 'toggle',
      label: 'Force play',
      default: false,
      advanced: true,
      group: 'House rules',
      help: 'A card you drew that can be played must be played.',
    },
  ],
  [
    {
      id: 'classic',
      label: 'Straight Eights',
      values: {
        twosDrawTwo: false,
        queensSkip: false,
        acesReverse: false,
        stackDrawTwo: false,
        drawUntilPlayable: true,
        forcePlay: false,
        targetScore: 100,
      },
    },
    {
      id: 'house',
      label: 'House Eights',
      values: {
        twosDrawTwo: true,
        queensSkip: true,
        acesReverse: true,
        stackDrawTwo: false,
        drawUntilPlayable: true,
        forcePlay: false,
        targetScore: 100,
      },
    },
    {
      id: 'chaos',
      label: 'Crazy Eights',
      values: {
        twosDrawTwo: true,
        queensSkip: true,
        acesReverse: true,
        stackDrawTwo: true,
        drawUntilPlayable: false,
        forcePlay: true,
        targetScore: 150,
      },
    },
  ],
);
