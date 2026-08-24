import type { GameCatalogEntry } from '@parlour/engine';
import { ratscrewConfigSchema, type RatscrewConfig } from './config';
import { ratscrewHowToPlay } from './howto';

/**
 * Rat Screw's entry on the parlour shelf. The app's game picker and mode picker
 * are generated from this; the mode ids here are the config presets in
 * {@link ratscrewConfigSchema}.
 */
export const ratscrewCatalog: GameCatalogEntry<RatscrewConfig> = {
  id: 'ratscrew',
  gameId: 'ratscrew',
  name: 'Rat Screw',
  subtitle: 'the slap game',
  tagline: 'Slap the pile first',
  description:
    'Flip onto a shared pile and slap doubles, sandwiches and more before anyone else. Real-time reflexes, face-card challenges, mis-slap burns.',
  facts: ['2–4 players', 'real-time slaps', 'solo or friends'],
  accent: '#8f5fb5',
  shade: '#4a2a68',
  art: [
    { label: '7♦', tint: ['#8f5fb5', '#4a2a68'] },
    { label: '7♣', tint: ['#b8593f', '#6e2a1a'] },
    { label: 'SLAP!', tint: ['#d98e3c', '#7c4a17'] },
    { label: 'K♠', tint: ['#4ba1ba', '#25586e'] },
  ],
  href: '/ratscrew',
  howToPlay: ratscrewHowToPlay,
  seats: [2, 3, 4],
  configSchema: ratscrewConfigSchema,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic Slap',
      tagline: 'Doubles & sandwiches',
      description:
        'The pub standard: flip fast, watch for doubles and sandwiches, and slap before the window shuts.',
      facts: ['slap window 1.2s', 'mis-slaps burn', '~8 min'],
      accent: '#d98e3c',
      shade: '#7c4a17',
      art: [
        { label: '7♦', tint: ['#d98e3c', '#7c4a17'] },
        { label: '7♣', tint: ['#b8593f', '#6e2a1a'] },
        { label: 'SLAP!', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
    {
      id: 'quick-reflex',
      preset: 'quick-reflex',
      name: 'Quick Reflex',
      tagline: 'Mean windows',
      description:
        'Same classic patterns on a hair trigger — the slap window slams shut in 0.7 seconds.',
      facts: ['slap window 0.7s', 'for sharp eyes', '~6 min'],
      accent: '#b8593f',
      shade: '#6e2a1a',
      motif: 'clock',
    },
    {
      id: 'slaphappy',
      preset: 'slaphappy',
      name: 'Slaphappy',
      tagline: 'Every pattern live',
      description:
        'Marriages, tens, top-bottom and runs all count on top of the classics. Chaos, warmly lit, extremely loud.',
      facts: ['all patterns', 'slap window 0.8s', '~5 min'],
      accent: '#8f5fb5',
      shade: '#4a2a68',
      art: [
        { label: 'K♥', tint: ['#8f5fb5', '#4a2a68'] },
        { label: 'Q♠', tint: ['#5fae7b', '#2f6b48'] },
        { label: '⚡', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
  ],
};
