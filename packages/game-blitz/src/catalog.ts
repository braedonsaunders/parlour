import type { GameCatalogEntry } from '@parlour/engine';
import { blitzConfigSchema, type BlitzConfig } from './config';
import { orderBlitzHand } from './hand';
import { blitzHowToPlay } from './howto';

/**
 * Blitz's entry on the parlour shelf. The app's game picker and mode picker are
 * generated from this, so presentation lives beside the rules it describes.
 */
export const blitzCatalog: GameCatalogEntry<BlitzConfig> = {
  id: 'blitz',
  gameId: 'blitz',
  name: 'Blitz',
  subtitle: 'the 31 game',
  tagline: 'Chase thirty-one',
  description:
    'Draw, swap, and knock your way to 31 in one suit. Three match formats, sly bots, and one very loud celebration.',
  facts: ['2–4 players', 'classic · fast · timed', 'solo or friends'],
  accent: '#e29349',
  shade: '#96471c',
  // Paper cards: no tint, so the shelf draws Blitz's muted standard deck.
  art: [{ label: 'A♠' }, { label: '31' }, { label: 'K♠' }],
  href: '/play',
  howToPlay: blitzHowToPlay,
  seats: [2, 3, 4],
  configSchema: blitzConfigSchema,
  handOrder: orderBlitzHand,
  modes: [
    {
      id: 'classic',
      motif: 'lives',
      name: 'Classic',
      tagline: 'Lives on the line',
      description:
        'Lose a round, lose a life. Knock early or chase the perfect 31 — last player with chips takes the match.',
      facts: ['3 lives each', 'last one standing', '~5–10 min'],
      accent: '#e29349',
      shade: '#96471c',
    },
    {
      id: 'fast',
      motif: 'snap',
      name: 'Fast',
      tagline: 'One round at a time',
      description:
        'Self-contained rounds, instant redeal. Highest hand wins the pot — first to three wins the match.',
      facts: ['first to 3 wins', 'no eliminations', '~2–4 min'],
      accent: '#5fae7b',
      shade: '#2f6b48',
    },
    {
      id: 'timed',
      motif: 'clock',
      name: 'Timed',
      tagline: 'Race the buzzer',
      description:
        'A three-minute match clock and quick-draw turn timers. Most round wins when the bell rings takes it.',
      facts: ['3:00 match clock', '7 s turn timer', 'sudden-death ties'],
      accent: '#4ba1ba',
      shade: '#25586e',
    },
  ],
};
