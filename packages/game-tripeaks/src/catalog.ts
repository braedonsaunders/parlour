import { defineGameCatalog } from '@parlour/engine';
import { orderTripeaksHand } from './cards';
import { tripeaksConfig } from './config';
import { tripeaksHowToPlay } from './howto';

export const tripeaksCatalog = defineGameCatalog({
  id: 'tripeaks',
  gameId: 'tripeaks',
  name: 'TriPeaks',
  subtitle: 'clear the three peaks',
  tagline: 'Play ±1 onto the hole',
  description:
    'Eighteen cards in three peaks, every card face up. Free a card by clearing what rests on it, chain plays onto the hole, and clear the peaks.',
  facts: ['1 player', 'daily seeded peaks', 'offline'],
  accent: '#4ba1ba',
  shade: '#25586e',
  art: [
    { label: '9♦', tint: ['#4ba1ba', '#25586e'] },
    { label: '10♠', tint: ['#3f7d62', '#1f4b3a'] },
    { label: 'J♥', tint: ['#b8593f', '#6e2a1a'] },
  ],
  href: '/tripeaks',
  howToPlay: tripeaksHowToPlay,
  seats: [1],
  configSchema: tripeaksConfig,
  handOrder: orderTripeaksHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One deal for everyone',
      description:
        'A date-seeded Classic deal. Replay it, share it, or come back tomorrow for a fresh set of peaks.',
      facts: ['no wrap', 'same daily deal', 'lower leftover wins'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Ace and King stop you',
      description: 'A fresh seeded deal. Ace and King are dead ends; the stock never comes back.',
      facts: ['no wrap', 'fresh deal', 'no recycle'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'K♠', tint: ['#4ba1ba', '#25586e'] },
        { label: 'A♥', tint: ['#b8593f', '#6e2a1a'] },
      ],
    },
    {
      id: 'relaxed',
      preset: 'relaxed',
      name: 'Relaxed',
      tagline: 'Ace wraps King',
      description:
        'The same three peaks, but Ace and King play onto each other and the hole may be recycled once.',
      facts: ['wraps A–K', 'fresh deal', 'one recycle'],
      accent: '#3f7d62',
      shade: '#1f4b3a',
      art: [
        { label: 'A♦', tint: ['#e2b049', '#8a6a1c'] },
        { label: 'K♣', tint: ['#3f7d62', '#1f4b3a'] },
      ],
    },
  ],
});
