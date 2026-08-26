import { defineGameCatalog } from '@parlour/engine';
import { orderOhHellHand } from './cards';
import { ohhellConfig } from './config';
import { ohhellHowToPlay } from './howto';

/**
 * Oh Hell's entry on the parlour shelf. Mode ids match the config presets in
 * {@link ohhellConfig}.
 */
export const ohhellCatalog = defineGameCatalog({
  id: 'ohhell',
  gameId: 'ohhell',
  name: 'Oh Hell',
  subtitle: 'the bidding game',
  tagline: 'Name your tricks. Take exactly that.',
  description:
    'Hands grow and shrink every round while you bid the exact number of tricks you will take. The hook rule guarantees someone misses — make sure it is not you.',
  facts: ['3–7 players', 'bid · trump · exact', 'solo or friends'],
  accent: '#6b3d55',
  shade: '#381c2c',
  art: [
    { label: 'A♥', tint: ['#a04a68', '#5c2338'] },
    { label: '7♣' },
    { label: 'W', tint: ['#7b5bd6', '#3c2b78'] },
    { label: 'J', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/ohhell',
  howToPlay: ohhellHowToPlay,
  seats: [3, 4, 5, 6, 7],
  configSchema: ohhellConfig,
  handOrder: orderOhHellHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Up and down',
      description:
        'The classic arc — one card, growing to a peak, back down to one. Hook rule on, exact bids only. Someone misses every round; not you, hopefully.',
      facts: ['1…peak…1 hands', 'hook rule on', '~20 min'],
      accent: '#6b3d55',
      shade: '#381c2c',
      art: [
        { label: '1', tint: ['#a04a68', '#5c2338'] },
        { label: '9', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'Deal big, shrink fast',
      description:
        'Starts at five cards and counts straight down to one. A whole match inside ten minutes, all nerve and no padding.',
      facts: ['5→1 hands', '~10 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [{ label: '5', tint: ['#e29349', '#96471c'] }, { label: '1' }],
    },
    {
      id: 'wizard',
      preset: 'wizard',
      name: 'Wizard',
      tagline: 'Sixty cards, four certainties',
      description:
        'Four Wizards always win and four Jesters never do. The led suit bends around them and the dealer sometimes picks trump. Chaos, formalised.',
      facts: ['60-card deck', 'wizards on'],
      accent: '#7b5bd6',
      shade: '#3c2b78',
      art: [
        { label: 'W', tint: ['#7b5bd6', '#3c2b78'] },
        { label: 'J', tint: ['#e2b049', '#8a6a1c'] },
        { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
      ],
    },
  ],
});
