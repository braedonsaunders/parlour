import type { GameCatalogEntry } from '@parlour/engine';
import { orderPokerHand } from './cards';
import { pokerConfig, type PokerRules } from './config';
import { pokerHowToPlay } from './howto';

/**
 * Poker's entry on the parlour shelf. Mode ids match the config presets in
 * {@link pokerConfig}.
 */
export const pokerCatalog: GameCatalogEntry<PokerRules> = {
  id: 'poker',
  gameId: 'poker',
  name: 'Poker',
  subtitle: 'no-limit hold’em',
  tagline: 'Last stack standing',
  description:
    'Two cards of your own, five in the middle, and every chip you have to say how much you believe them. The blinds climb until somebody has all of it.',
  facts: ['2–6 players', 'no-limit hold’em', 'play chips only'],
  accent: '#2f6b48',
  shade: '#17351f',
  art: [
    { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
    { label: 'A♥', tint: ['#c2593f', '#7a2f1f'] },
    { label: 'K♦' },
    { label: 'Q♣', tint: ['#5fae7b', '#2f6b48'] },
  ],
  href: '/poker',
  howToPlay: pokerHowToPlay,
  seats: [2, 3, 4, 5, 6],
  configSchema: pokerConfig,
  handOrder: orderPokerHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'The full table',
      description:
        'Three thousand chips each and blinds that climb every eight hands. Room to play a hand out before anyone is committed.',
      facts: ['3,000 chips', 'blinds every 8', '~25 min'],
      accent: '#2f6b48',
      shade: '#17351f',
      art: [
        { label: 'A♠', tint: ['#4a4a55', '#1d1d26'] },
        { label: 'A♥', tint: ['#c2593f', '#7a2f1f'] },
      ],
    },
    {
      id: 'turbo',
      preset: 'turbo',
      name: 'Turbo',
      tagline: 'Shove or go home',
      description:
        'Short stacks and blinds that double every four hands. Nobody gets to wait for aces.',
      facts: ['1,500 chips', 'blinds every 4', '~10 min'],
      accent: '#e29349',
      shade: '#96471c',
      art: [{ label: '7♦', tint: ['#e29349', '#96471c'] }, { label: '2♣' }],
    },
    {
      id: 'deep',
      preset: 'deep',
      name: 'Deep Stack',
      tagline: 'Play the player',
      description:
        'Six thousand chips and a slow ladder, antes off. The long game, where position and patience are worth something.',
      facts: ['6,000 chips', 'blinds every 12', 'no ante'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'K♦', tint: ['#4ba1ba', '#25586e'] },
        { label: 'K♣', tint: ['#4a4a55', '#1d1d26'] },
      ],
    },
  ],
};
