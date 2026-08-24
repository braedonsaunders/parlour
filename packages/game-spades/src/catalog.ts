import type { GameCatalogEntry } from '@parlour/engine';
import { orderSpadesHand } from './cards';
import { spadesConfig, type SpadesRules } from './config';
import { spadesHowToPlay } from './howto';

/**
 * Spades' entry on the parlour shelf. Mode ids match the config presets in
 * {@link spadesConfig}.
 */
export const spadesCatalog: GameCatalogEntry<SpadesRules> = {
  id: 'spades',
  gameId: 'spades',
  name: 'Spades',
  subtitle: 'the partner game',
  tagline: 'Bid your books',
  description:
    'Sit across from your partner, name a number, and take that many tricks — no more, no fewer if you can help it. Spades are always trump. Bags will find you.',
  facts: ['4 players · 2v2', 'bid · trump · bags', 'solo or friends'],
  accent: '#3d4a6b',
  shade: '#1c2438',
  art: [
    { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
    { label: 'K♠', tint: ['#3d4a6b', '#1c2438'] },
    { label: 'Q♠' },
    { label: 'J♠', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/spades',
  howToPlay: spadesHowToPlay,
  seats: [4],
  configSchema: spadesConfig,
  handOrder: orderSpadesHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'By the book',
      description:
        'Partnership Spades to 500, nil on, bags on. The game as it is played at every kitchen table.',
      facts: ['game to 500', 'nil · bags', '~25 min'],
      accent: '#3d4a6b',
      shade: '#1c2438',
      art: [
        { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
        { label: '500', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'First to 250',
      description: 'Same rules, shorter race — 250 points and out. A whole match inside a lunch break.',
      facts: ['game to 250', 'nil · bags', '~12 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [{ label: '250', tint: ['#e29349', '#96471c'] }, { label: 'A♠' }],
    },
    {
      id: 'clean-books',
      preset: 'clean-books',
      name: 'Clean Books',
      tagline: 'No sandbags',
      description:
        'Make your bid or go set — overtricks are not bags and do not add a point. Precision over padding.',
      facts: ['game to 500', 'nil on', 'bags off'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '13', tint: ['#4ba1ba', '#25586e'] },
        { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
      ],
    },
  ],
};
