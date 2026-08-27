import { defineGameCatalog } from '@parlour/engine';
import { orderDurakHand } from './cards';
import { durakConfig } from './config';
import { durakHowToPlay } from './howto';

/**
 * Durak's entry on the parlour shelf. The mode ids here are the config
 * presets in {@link durakConfig}.
 */
export const durakCatalog = defineGameCatalog({
  id: 'durak',
  gameId: 'durak',
  name: 'Durak',
  subtitle: 'the fool nobody wants to be',
  tagline: 'Never be the last one holding cards',
  description:
    "A short pack, one trump suit, and a table of attacks and defences. Beat every card thrown at you or pick up the lot — the last seat still holding cards wears the fool's cap.",
  facts: ['2–6 players', '36-card pack', 'solo or friends'],
  accent: '#8a4f7d',
  shade: '#452539',
  art: [
    { label: 'A♠', tint: ['#8a4f7d', '#452539'] },
    { label: '6♥', tint: ['#c8566b', '#7c2c3e'] },
    { label: 'K♦', tint: ['#e2b049', '#b07a1c'] },
    { label: 'Q♣', tint: ['#5fae7b', '#2f6b48'] },
  ],
  href: '/durak',
  howToPlay: durakHowToPlay,
  seats: [2, 3, 4, 5, 6],
  configSchema: durakConfig,
  handOrder: orderDurakHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'Podkidnoy — the traditional throw-in game',
      description:
        'Attack, defend, and throw in anything that matches a rank already on the table. No transfers — beat it or pick it up.',
      facts: ['throw-ins on', 'no transfer', '6-card hands'],
      accent: '#8a4f7d',
      shade: '#452539',
      art: [
        { label: 'A♠', tint: ['#8a4f7d', '#452539'] },
        { label: '6♥', tint: ['#c8566b', '#7c2c3e'] },
        { label: '6♦', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
    {
      id: 'transfer',
      preset: 'transfer',
      name: 'Perevodnoy',
      tagline: 'Pass the whole attack along',
      description:
        'Everything from Classic, plus one escape hatch: a defender holding nothing they have beaten yet can transfer a matching rank straight to the next seat.',
      facts: ['transfers on', 'throw-ins on', '6-card hands'],
      accent: '#5f7fae',
      shade: '#2d3d5c',
      art: [
        { label: 'K♠', tint: ['#5f7fae', '#2d3d5c'] },
        { label: 'K♥', tint: ['#c8566b', '#7c2c3e'] },
        { label: 'K♦', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
    {
      id: 'heads-up',
      preset: 'heads-up',
      name: 'Heads-Up',
      tagline: 'One on one, fast finish',
      description:
        'Built for two. The first hand to empty wins on the spot, stock or no stock — no waiting for the pack to run dry.',
      facts: ['2 players', 'instant win', 'fast'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [
        { label: 'A♥', tint: ['#c8566b', '#7c2c3e'] },
        { label: 'A♦', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
  ],
});
