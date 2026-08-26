import { defineGameCatalog } from '@parlour/engine';
import { orderPyramidHand } from './cards';
import { pyramidConfig } from './config';
import { pyramidHowToPlay } from './howto';

export const pyramidCatalog = defineGameCatalog({
  id: 'pyramid',
  gameId: 'pyramid',
  name: 'Pyramid',
  subtitle: 'pair to thirteen',
  tagline: 'Clear the daily pyramid',
  description:
    'Twenty-eight cards in a triangle. Pair free ranks that sum to 13, turn the stock, and leave as little as you can.',
  facts: ['1 player', 'daily seeded pyramid', 'offline'],
  accent: '#b8593f',
  shade: '#6e2a1a',
  art: [
    { label: 'K♥', tint: ['#b8593f', '#6e2a1a'] },
    { label: 'Q♠', tint: ['#3f7d62', '#1f4b3a'] },
    { label: 'A♦', tint: ['#e2b049', '#8a6a1c'] },
  ],
  href: '/pyramid',
  howToPlay: pyramidHowToPlay,
  seats: [1],
  configSchema: pyramidConfig,
  handOrder: orderPyramidHand,
  modes: [
    {
      id: 'daily',
      preset: 'classic',
      name: 'Daily',
      tagline: 'One pyramid for everyone',
      description:
        'A date-seeded Classic pyramid. Replay it, share it, or come back tomorrow for a fresh table.',
      facts: ['two recycles', 'same daily deal', 'lower leftover wins'],
      accent: '#e2b049',
      shade: '#8a6a1c',
      motif: 'clock',
    },
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Three passes',
      description:
        'A fresh seeded pyramid. The waste may be recycled twice — three trips through the stock.',
      facts: ['two recycles', 'fresh deal', 'three passes'],
      accent: '#b8593f',
      shade: '#6e2a1a',
      art: [
        { label: 'K♠', tint: ['#b8593f', '#6e2a1a'] },
        { label: 'Q♥', tint: ['#3f7d62', '#1f4b3a'] },
      ],
    },
    {
      id: 'relaxed',
      preset: 'relaxed',
      name: 'Relaxed',
      tagline: 'Unlimited passes',
      description:
        'The same pairing table, but the waste may be flipped back as often as you like.',
      facts: ['unlimited recycles', 'fresh deal', 'no pass limit'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'A♦', tint: ['#4ba1ba', '#25586e'] },
        { label: 'Q♣', tint: ['#e2b049', '#8a6a1c'] },
      ],
    },
  ],
});
