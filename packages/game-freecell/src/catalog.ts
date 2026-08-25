import type { GameCatalogEntry } from '@parlour/engine';
import { orderFreecellHand } from './cards';
import { freecellConfig, type FreecellRules } from './config';
import { freecellHowToPlay } from './howto';

export const freecellCatalog: GameCatalogEntry<FreecellRules> = {
  id: 'freecell',
  gameId: 'freecell',
  name: 'FreeCell',
  subtitle: 'the open solitaire',
  tagline: 'Clear the daily table',
  description:
    'Eight columns, every card face up. Park extras in the free cells and send every suit home from Ace to King. The same daily deal waits for everyone.',
  facts: ['1 player', 'daily seeded deal', 'offline'],
  accent: '#4ba1ba',
  shade: '#25586e',
  art: [
    { label: 'A♥', tint: ['#b8593f', '#6e2a1a'] },
    { label: 'K♣', tint: ['#4ba1ba', '#25586e'] },
    { label: 'Q♦', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/freecell',
  howToPlay: freecellHowToPlay,
  seats: [1],
  configSchema: freecellConfig,
  handOrder: orderFreecellHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One table for everyone',
      description:
        'A date-seeded Classic deal. Replay it, share it, or come back tomorrow for a fresh table.',
      facts: ['four cells', 'same daily deal', 'any card to empty'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Four free cells',
      description: 'A fresh seeded deal with four one-card free cells.',
      facts: ['four cells', 'fresh deal', 'any card to empty'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'K♠', tint: ['#4ba1ba', '#25586e'] },
        { label: 'Q♥', tint: ['#b8593f', '#6e2a1a'] },
      ],
    },
    {
      id: 'relaxed',
      preset: 'relaxed',
      name: 'Relaxed',
      tagline: 'Six free cells',
      description: 'A gentler fresh deal: two extra cells make longer runs easier to move.',
      facts: ['six cells', 'fresh deal', 'any card to empty'],
      accent: '#3f7d62',
      shade: '#1f4b3a',
      art: [
        { label: 'A♦', tint: ['#3f7d62', '#1f4b3a'] },
        { label: '2♦', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
  ],
};
