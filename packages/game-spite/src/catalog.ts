import type { GameCatalogEntry } from '@parlour/engine';
import { orderSpiteHand } from './cards';
import { spiteConfig, type SpiteRules } from './config';
import { spiteHowToPlay } from './howto';

/**
 * Spite & Malice's entry on the parlour shelf. The app's game picker and mode
 * picker are generated from this, so presentation lives beside the rules it
 * describes — the mode ids here are the config presets in {@link spiteConfig}.
 */
export const spiteCatalog: GameCatalogEntry<SpiteRules> = {
  id: 'spite',
  gameId: 'spite',
  name: 'Spite & Malice',
  subtitle: 'the payoff pile race',
  tagline: 'Pay them back in spades',
  description:
    'Build the centre piles Ace to Queen, dump your payoff stack, and ruin everyone else’s plans with well-timed wilds. The name is the rules.',
  facts: ['2–4 players', 'classic · quick · cutthroat', 'solo or friends'],
  accent: '#7f6bd0',
  shade: '#402f7a',
  art: [
    { label: 'A', tint: ['#8f7fe0', '#4a3a95'] },
    { label: 'K★', tint: ['#4ba1ba', '#25586e'] },
    { label: 'Q', tint: ['#c8566b', '#7c2c3e'] },
    { label: '★', tint: ['#e29349', '#96471c'] },
  ],
  href: '/spite',
  howToPlay: spiteHowToPlay,
  seats: [2, 3, 4],
  configSchema: spiteConfig,
  handOrder: orderSpiteHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'The full race',
      description:
        'Twenty cards buried in every payoff pile and all the wilds in the deck. The game as it was meant to be nursed along.',
      facts: ['20-card payoff', 'kings & jokers wild', '~15 min'],
      accent: '#7f6bd0',
      shade: '#402f7a',
      art: [
        { label: 'A', tint: ['#8f7fe0', '#4a3a95'] },
        { label: 'Q', tint: ['#c8566b', '#7c2c3e'] },
        { label: 'K★', tint: ['#4ba1ba', '#25586e'] },
      ],
    },
    {
      id: 'quick',
      preset: 'quick',
      name: 'Quick',
      tagline: 'Shorter grudge',
      description:
        'Ten-card payoff piles keep everything else intact — same wilds, same malice, half the wait for your revenge.',
      facts: ['10-card payoff', 'all wilds', '~5–8 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'A', tint: ['#4ba1ba', '#25586e'] },
        { label: '★', tint: ['#e29349', '#96471c'] },
      ],
    },
    {
      id: 'cutthroat',
      preset: 'cutthroat',
      name: 'Cutthroat',
      tagline: 'No mercy, no refills',
      description:
        'Thirteen cards deep and no mid-turn refill: empty your hand at the wrong moment and you play short-handed while someone else wins.',
      facts: ['13-card payoff', 'no mid-turn refill', 'harsh'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [
        { label: 'Q', tint: ['#c8566b', '#7c2c3e'] },
        { label: 'K★', tint: ['#8f7fe0', '#4a3a95'] },
        { label: '✗', tint: ['#96471c', '#5c2b10'] },
      ],
    },
  ],
};
