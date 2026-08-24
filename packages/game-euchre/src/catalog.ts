import type { GameCatalogEntry } from '@parlour/engine';
import { euchreConfig, type EuchreRules } from './config';
import { orderEuchreHand } from './deck';
import { euchreHowToPlay } from './howto';

/**
 * Euchre's entry on the parlour shelf. The app's game picker, mode picker, seat
 * picker and generated rules panel all read from this — the mode ids here are
 * the config presets in {@link euchreConfig}.
 */
export const euchreCatalog: GameCatalogEntry<EuchreRules> = {
  id: 'euchre',
  gameId: 'euchre',
  name: 'Euchre',
  subtitle: 'the partner game',
  tagline: 'Take tricks for your team',
  description:
    'Order it up, name your trump, and chase bowers with the player across the table. First team to ten takes the match.',
  facts: ['4 players · 2v2', 'trick-taking', 'solo or friends'],
  accent: '#5fae7b',
  shade: '#2f6b48',
  art: [
    { label: 'J♥', tint: ['#d95763', '#a3372c'] },
    { label: 'J♦', tint: ['#e2b049', '#b07a1c'] },
    { label: 'A♠' },
  ],
  href: '/euchre',
  howToPlay: euchreHowToPlay,
  seats: [4],
  configSchema: euchreConfig,
  handOrder: orderEuchreHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic Pub',
      tagline: 'The real deal',
      description:
        'Ten points, stick the dealer, going alone. The game as it is played at every firehall and kitchen table.',
      facts: ['game to 10', 'stick the dealer', '~20 min'],
      accent: '#5fae7b',
      shade: '#2f6b48',
      art: [
        { label: 'J♥', tint: ['#d95763', '#a3372c'] },
        { label: 'A♥', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'quick-cut',
      preset: 'quick-cut',
      name: 'Quick Cut',
      tagline: 'First to five',
      description:
        'Same rules, shorter race — five points and out. Perfect when the kettle is still warming.',
      facts: ['game to 5', '~10 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [{ label: '9♣' }, { label: 'A♦', tint: ['#e2b049', '#b07a1c'] }],
    },
    {
      id: 'long-game',
      preset: 'long-game',
      name: 'Long Game',
      tagline: 'Settle in',
      description: 'Fifteen points for a proper evening of it. Grudges welcome.',
      facts: ['game to 15', '~30 min'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [{ label: 'K♠', tint: ['#4ba1ba', '#25586e'] }, { label: 'Q♠' }],
    },
    {
      id: 'old-school',
      preset: 'old-school',
      name: 'Old School',
      tagline: 'Dealer may pass',
      description:
        'No stick-the-dealer — everyone can pass and the deal moves on. The way some granddads insist on it.',
      facts: ['game to 10', 'no stick', '~20 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [{ label: '10♥', tint: ['#d95763', '#a3372c'] }, { label: 'K♦' }],
    },
  ],
};
