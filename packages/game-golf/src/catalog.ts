import { defineGameCatalog } from '@parlour/engine';
import { orderGolfHand } from './cards';
import { golfConfig } from './config';
import { golfHowToPlay } from './howto';

export const golfCatalog = defineGameCatalog({
  id: 'golf',
  gameId: 'golf',
  name: 'Golf',
  subtitle: 'the fast solitaire',
  tagline: 'Play ±1 onto the hole',
  description:
    'Seven columns of five, every card face up. Play a rank next to the hole, chain as far as you can, and leave as little on the grass as possible.',
  facts: ['1 player', 'daily seeded hole', 'offline'],
  accent: '#3f7d62',
  shade: '#1f4b3a',
  art: [
    { label: '8♥', tint: ['#b8593f', '#6e2a1a'] },
    { label: '9♠', tint: ['#3f7d62', '#1f4b3a'] },
    { label: '7♣', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/golf',
  howToPlay: golfHowToPlay,
  seats: [1],
  configSchema: golfConfig,
  handOrder: orderGolfHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One hole for everyone',
      description:
        'A date-seeded Classic hole. Replay it, share it, or come back tomorrow for a fresh table.',
      facts: ['no wrap', 'same daily deal', 'lower score wins'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Ace and King stop you',
      description: 'A fresh seeded hole. Ace and King are dead ends; the stock never comes back.',
      facts: ['no wrap', 'fresh deal', 'no recycle'],
      accent: '#3f7d62',
      shade: '#1f4b3a',
      art: [
        { label: 'K♠', tint: ['#3f7d62', '#1f4b3a'] },
        { label: 'A♥', tint: ['#b8593f', '#6e2a1a'] },
      ],
    },
    {
      id: 'fairway',
      preset: 'fairway',
      name: 'Fairway',
      tagline: 'Ace wraps King',
      description:
        'The same fast hole, but Ace and King play onto each other so chains run longer.',
      facts: ['wraps A–K', 'fresh deal', 'no recycle'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'A♦', tint: ['#4ba1ba', '#25586e'] },
        { label: 'K♣', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
  ],
});
