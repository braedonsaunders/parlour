import type { GameCatalogEntry } from '@parlour/engine';
import { orderKlondikeHand } from './cards';
import { klondikeConfig, type KlondikeRules } from './config';
import { klondikeHowToPlay } from './howto';

export const klondikeCatalog: GameCatalogEntry<KlondikeRules> = {
  id: 'klondike',
  gameId: 'klondike',
  name: 'Klondike',
  subtitle: 'the solitaire classic',
  tagline: 'Clear the daily table',
  description:
    'Build seven columns down in alternating colors, turn the stock, and send every suit home from Ace to King. The same daily deal waits for everyone.',
  facts: ['1 player', 'daily seeded deal', 'offline'],
  accent: '#3f7d62',
  shade: '#1f4b3a',
  art: [
    { label: 'A♥', tint: ['#b8593f', '#6e2a1a'] },
    { label: 'K♣', tint: ['#3f7d62', '#1f4b3a'] },
    { label: 'Q♦', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/klondike',
  howToPlay: klondikeHowToPlay,
  seats: [1],
  configSchema: klondikeConfig,
  handOrder: orderKlondikeHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One table for everyone',
      description:
        'A date-seeded Draw Three deal. Replay it, share it, or come back tomorrow for a fresh table.',
      facts: ['draw three', 'same daily deal', 'unlimited passes'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Turn three',
      description: 'A fresh seeded deal with three cards turned from the stock at a time.',
      facts: ['draw three', 'fresh deal', 'unlimited passes'],
      accent: '#3f7d62',
      shade: '#1f4b3a',
      art: [
        { label: 'K♠', tint: ['#3f7d62', '#1f4b3a'] },
        { label: 'Q♥', tint: ['#b8593f', '#6e2a1a'] },
      ],
    },
    {
      id: 'relaxed',
      preset: 'relaxed',
      name: 'Relaxed',
      tagline: 'Turn one',
      description: 'A gentler fresh deal: every stock card arrives one at a time.',
      facts: ['draw one', 'fresh deal', 'unlimited passes'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'A♦', tint: ['#4ba1ba', '#25586e'] },
        { label: '2♦', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
  ],
};
