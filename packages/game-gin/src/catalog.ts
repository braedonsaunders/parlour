import type { GameCatalogEntry } from '@parlour/engine';
import { ginConfigSchema, type GinConfig } from './config';
import { ginHowToPlay } from './howto';
import { orderGinHand } from './melds';

/**
 * Gin Rummy's entry on the parlour shelf. Mode ids here match the config
 * presets in {@link ginConfigSchema} — Classic/Quick/Purist are rule presets,
 * so each mode carries its `preset` id.
 */
export const ginCatalog: GameCatalogEntry<GinConfig> = {
  id: 'gin',
  gameId: 'gin',
  name: 'Gin',
  subtitle: 'the rummy classic',
  tagline: 'Meld, knock, win the night',
  description:
    'Ten cards, two chairs. Build sets and runs, shed your deadwood, and slap the table before your opponent does.',
  facts: ['2 players', 'knock · gin · big gin', 'solo or friends'],
  accent: '#5f9e6e',
  shade: '#2e5940',
  art: [
    { label: '7♠', tint: ['#5fae7b', '#2f6b48'] },
    { label: 'K♥', tint: ['#c94b40', '#8a2f28'] },
    { label: 'A♣' },
  ],
  href: '/gin',
  howToPlay: ginHowToPlay,
  seats: [2],
  configSchema: ginConfigSchema,
  handOrder: orderGinHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Straight to 100',
      description:
        'The pub standard — knock at ten deadwood or better, gin pays 25, big gin pays 31. First past 100 takes it.',
      facts: ['knock cap 10', 'match to 100', '~15 min'],
      accent: '#5f9e6e',
      shade: '#2e5940',
      art: [
        { label: '7♠', tint: ['#5fae7b', '#2f6b48'] },
        { label: '7♥', tint: ['#c94b40', '#8a2f28'] },
        { label: '7♦', tint: ['#4ba1ba', '#25586e'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'Race to 50',
      description: 'Same rules, shorter ladder. A brisk two-hander for the kettle break.',
      facts: ['match to 50', '~8 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [
        { label: 'A♠', tint: ['#5fae7b', '#2f6b48'] },
        { label: '10♥', tint: ['#c94b40', '#8a2f28'] },
        { label: 'J♦', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
    {
      id: 'purist',
      preset: 'purist',
      name: 'Purist',
      tagline: 'No frills',
      description:
        'Big gin is off and box bonuses stay home. Pure knocks, pure deadwood, no safety net.',
      facts: ['no big gin', 'no box bonus'],
      accent: '#7f6bd0',
      shade: '#402f7a',
      art: [
        { label: 'Q♠', tint: ['#7f6bd0', '#402f7a'] },
        { label: '8♣', tint: ['#5fae7b', '#2f6b48'] },
        { label: '3♥', tint: ['#c94b40', '#8a2f28'] },
      ],
    },
  ],
};
