import { defineGameCatalog } from '@parlour/engine';
import { orderPinochleHand } from './cards';
import { pinochleConfig } from './config';
import { pinochleHowToPlay } from './howto';

/**
 * Pinochle's entry on the parlour shelf. Mode ids match the config presets in
 * {@link pinochleConfig}.
 */
export const pinochleCatalog = defineGameCatalog({
  id: 'pinochle',
  gameId: 'pinochle',
  name: 'Pinochle',
  subtitle: 'the partner game',
  tagline: 'Bid it, meld it, take it',
  description:
    'Sit across from your partner, win the auction, name trump, and lay down your meld. Aces, tens and kings are the tricks that matter — clear your bid or go set for it.',
  facts: ['4 players · 2v2', 'bid · meld · trick-taking', 'solo or friends'],
  accent: '#8a5a44',
  shade: '#4a2c1f',
  art: [
    { label: 'A♦', tint: ['#a5453f', '#5c211d'] },
    { label: '10♠', tint: ['#4a4a55', '#1d1d26'] },
    { label: 'Q♠' },
    { label: 'J♦', tint: ['#a5453f', '#5c211d'] },
  ],
  href: '/pinochle',
  howToPlay: pinochleHowToPlay,
  seats: [4],
  configSchema: pinochleConfig,
  handOrder: orderPinochleHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Game to 150',
      description:
        'Partnership Pinochle to 150, minimum opening bid 25. The game as it is played at every kitchen table.',
      facts: ['game to 150', 'min bid 25', '~30 min'],
      accent: '#8a5a44',
      shade: '#4a2c1f',
      art: [
        { label: 'A♦', tint: ['#a5453f', '#5c211d'] },
        { label: '150', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'First to 100',
      description: 'Same rules, shorter race — 100 points, lower opening bid, out the door faster.',
      facts: ['game to 100', 'min bid 20', '~15 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [{ label: '100', tint: ['#e29349', '#96471c'] }, { label: 'A♦' }],
    },
    {
      id: 'marathon',
      preset: 'marathon',
      name: 'Marathon',
      tagline: 'Game to 500',
      description: 'A long partnership grind to 500 — every meld and every set matters.',
      facts: ['game to 500', 'min bid 25', '~90 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '500', tint: ['#4ba1ba', '#25586e'] },
        { label: '10♠', tint: ['#4a4a55', '#1d1d26'] },
      ],
    },
  ],
});
