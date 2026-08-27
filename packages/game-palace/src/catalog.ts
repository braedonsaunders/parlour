import { defineGameCatalog } from '@parlour/engine';
import { orderPalaceHand } from './cards';
import { MAX_SEATS, MIN_SEATS } from './game';
import { palaceConfig } from './config';
import { palaceHowToPlay } from './howto';

/**
 * Palace's entry on the parlour shelf. The app's game picker and mode picker
 * are generated from this, so presentation lives beside the rules it
 * describes — the mode ids here are the config presets in {@link palaceConfig}.
 */
export const palaceCatalog = defineGameCatalog({
  id: 'palace',
  gameId: 'palace',
  name: 'Palace',
  subtitle: 'the layer-clearing game',
  tagline: 'Clear the table, layer by layer',
  description:
    'Hand, then face-up, then face-down — burn tens, dodge twos, and be first to clear every layer. Also known as Shithead or Karma.',
  facts: [`${MIN_SEATS}–${MAX_SEATS} players`, '2s, 10s & 8s', 'solo or friends'],
  accent: '#6f8f5a',
  shade: '#3c5030',
  art: [
    { label: '2', tint: ['#6f8f5a', '#3c5030'] },
    { label: '10', tint: ['#c2593f', '#7a2f1f'] },
    { label: '8', tint: ['#4ba1ba', '#25586e'] },
  ],
  href: '/palace',
  howToPlay: palaceHowToPlay,
  seats: [MIN_SEATS, 3, 4, 5, MAX_SEATS],
  configSchema: palaceConfig,
  handOrder: orderPalaceHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'The full layered climb',
      description:
        'Swap, then shed hand, face-up and face-down. First to three round wins takes the table.',
      facts: ['first to 3', 'swap on', 'all specials'],
      accent: '#6f8f5a',
      shade: '#3c5030',
      art: [
        { label: '2', tint: ['#6f8f5a', '#3c5030'] },
        { label: '♛', tint: ['#e2b049', '#b07a1c'] },
        { label: '10', tint: ['#c2593f', '#7a2f1f'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'One round, straight to it',
      description: 'A single round decides it — same specials, no long match to bank.',
      facts: ['first to 1', '~10 min', 'great for a warm-up'],
      accent: '#c2593f',
      shade: '#7a2f1f',
      art: [
        { label: '5', tint: ['#d95763', '#a3372c'] },
        { label: '⚡', tint: ['#e2b049', '#b07a1c'] },
        { label: 'K', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'chaos',
      preset: 'chaos',
      name: 'Chaos',
      tagline: 'No swap, no mercy',
      description:
        'Straight from the deal into play — no swap phase to plan around. Every special stays maxed: 2s reset, 10s burn, 8s stay invisible, four of a kind torches the pile.',
      facts: ['first to 3', 'no swap phase', 'expect burns'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '8', tint: ['#4ba1ba', '#25586e'] },
        { label: '∞', tint: ['#7f6bd0', '#402f7a'] },
        { label: '2', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
  ],
});
