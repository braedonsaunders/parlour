import type { GameCatalogEntry } from '@parlour/engine';
import { orderHeartsHand } from './cards';
import { heartsConfigSchema, type HeartsRules } from './config';
import { heartsHowToPlay } from './howto';

/**
 * Hearts' entry on the parlour shelf. The app's game and mode pickers are
 * generated from this; the mode ids here ARE the config presets in
 * {@link heartsConfigSchema}, so a mode pick is a full house-rule set.
 */
export const heartsCatalog: GameCatalogEntry<HeartsRules> = {
  id: 'hearts',
  gameId: 'hearts',
  name: 'Hearts',
  subtitle: 'the evasion game',
  tagline: 'Take no hearts',
  description:
    'Dodge every heart, duck the Black Lady, and stick someone else with the points. Rotating passes, secret picks, one very sharp queen.',
  facts: ['4 players', 'pass · trick · evade', 'solo or friends'],
  accent: '#b8434f',
  shade: '#6e1f2c',
  art: [
    { label: 'Q♠', tint: ['#4a4a55', '#1d1d26'] },
    { label: '♥', tint: ['#d95763', '#8f2733'] },
    { label: 'J♦', tint: ['#e29349', '#a35a1c'] },
    { label: '2♣', tint: ['#5fae7b', '#2f6b48'] },
  ],
  href: '/hearts',
  howToPlay: heartsHowToPlay,
  seats: [4],
  configSchema: heartsConfigSchema,
  handOrder: orderHeartsHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'By the book',
      description:
        'Rotating left-right-across passes, a hold hand every fourth deal, no points on the first trick. Game to 100.',
      facts: ['game to 100', 'hold hands on', '~15 min'],
      accent: '#b8434f',
      shade: '#6e1f2c',
      art: [
        { label: 'Q♠', tint: ['#4a4a55', '#1d1d26'] },
        { label: '♥', tint: ['#d95763', '#8f2733'] },
        { label: '⇄', tint: ['#e29349', '#a35a1c'] },
      ],
    },
    {
      id: 'quickcut',
      preset: 'quickcut',
      name: 'Quick Cut',
      tagline: 'Same hearts, faster',
      description:
        'Identical rules, lower ceiling — first player past 50 ends it. A whole match inside a coffee break.',
      facts: ['game to 50', 'hold hands on', '~8 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '50', tint: ['#4ba1ba', '#25586e'] },
        { label: '♥', tint: ['#d95763', '#8f2733'] },
        { label: '⇄', tint: ['#e29349', '#a35a1c'] },
      ],
    },
    {
      id: 'cutthroat',
      preset: 'cutthroat',
      name: 'Cutthroat',
      tagline: 'The jack is loose',
      description:
        'The jack of diamonds scores −10 to whoever catches her, and penalty cards fly on trick one. Nobody is safe.',
      facts: ['J♦ −10', 'trick-one points', 'game to 100'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [
        { label: 'J♦', tint: ['#e29349', '#a35a1c'] },
        { label: 'Q♠', tint: ['#4a4a55', '#1d1d26'] },
        { label: '♥', tint: ['#d95763', '#8f2733'] },
      ],
    },
  ],
};
