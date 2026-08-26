import { defineGameCatalog } from '@parlour/engine';
import { orderSpiderHand } from './cards';
import { spiderConfig } from './config';
import { spiderHowToPlay } from './howto';

export const spiderCatalog = defineGameCatalog({
  id: 'spider',
  gameId: 'spider',
  name: 'Spider',
  subtitle: 'the two-deck solitaire',
  tagline: 'Peel eight suited runs',
  description:
    'Build ten columns down by rank, move only same-suit packed runs, and peel every King-to-Ace off the table. The same daily two-suit deal waits for everyone.',
  facts: ['1 player', 'daily seeded deal', 'offline'],
  accent: '#6b4c8a',
  shade: '#2d1f3d',
  art: [
    { label: 'K♠', tint: ['#6b4c8a', '#2d1f3d'] },
    { label: 'Q♥', tint: ['#b8593f', '#6e2a1a'] },
    { label: 'A♠', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/spider',
  howToPlay: spiderHowToPlay,
  seats: [1],
  configSchema: spiderConfig,
  handOrder: orderSpiderHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One table for everyone',
      description:
        'A date-seeded two-suit deal. Replay it, share it, or come back tomorrow for a fresh table.',
      facts: ['two suits', 'same daily deal', 'five stock rows'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'relaxed',
      preset: 'relaxed',
      name: 'Relaxed',
      tagline: 'All spades',
      description: 'A gentler fresh deal: every card is a spade, so packed runs assemble freely.',
      facts: ['one suit', 'fresh deal', 'five stock rows'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'K♠', tint: ['#4ba1ba', '#25586e'] },
        { label: 'A♠', tint: ['#6b4c8a', '#2d1f3d'] },
      ],
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Two suits',
      description: 'A fresh seeded deal painted in spades and hearts — the Microsoft default.',
      facts: ['two suits', 'fresh deal', 'five stock rows'],
      accent: '#6b4c8a',
      shade: '#2d1f3d',
      art: [
        { label: 'K♠', tint: ['#6b4c8a', '#2d1f3d'] },
        { label: 'Q♥', tint: ['#b8593f', '#6e2a1a'] },
      ],
    },
    {
      id: 'hard',
      preset: 'hard',
      name: 'Hard',
      tagline: 'Four suits',
      description:
        'The full two-deck deal. Packed same-suit runs are scarce and every peel is earned.',
      facts: ['four suits', 'fresh deal', 'five stock rows'],
      accent: '#8a3a4a',
      shade: '#3d1a22',
      art: [
        { label: 'K♣', tint: ['#8a3a4a', '#3d1a22'] },
        { label: 'Q♦', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
  ],
});
