import type { GameCatalogEntry } from '@parlour/engine';
import { cribbageConfigSchema, type CribbageConfig } from './config';
import { cribbageHowToPlay } from './howto';

/**
 * Cribbage's entry on the parlour shelf. The app's game picker and mode picker
 * are generated from this, so presentation lives beside the rules it describes.
 */
export const cribbageCatalog: GameCatalogEntry<CribbageConfig> = {
  id: 'cribbage',
  gameId: 'cribbage',
  name: 'Cribbage',
  subtitle: 'the pegging race',
  tagline: 'Peg home to 121',
  description:
    'The classic pub race — build fifteens, runs and pairs in your hand, peg them home on the board, and pray nobody cuts a jack behind you.',
  facts: ['2 players', 'classic · cutthroat', 'solo or friends'],
  accent: '#7d5ba6',
  shade: '#463061',
  // Paper cards: no tint, so the shelf draws cribbage's muted standard deck.
  art: [
    { label: 'J♠' },
    { label: '15' },
    { label: '5♦', tint: ['#8a6cc0', '#4c3172'] },
    { label: '121' },
  ],
  href: '/cribbage',
  howToPlay: cribbageHowToPlay,
  seats: [2],
  configSchema: cribbageConfigSchema,
  modes: [
    {
      id: 'classic-pub',
      name: 'Classic Pub',
      tagline: 'The real thing',
      description:
        'Six cards, two to the crib, and a long pegging race to 121. Skunks count — finish under 90 and hear about it forever.',
      facts: ['race to 121', 'skunk line at 90', '~10–15 min'],
      accent: '#7d5ba6',
      shade: '#463061',
      preset: 'classic-pub',
      art: [{ label: '5♥' }, { label: 'J♠' }, { label: '15' }, { label: '31' }],
    },
    {
      id: 'cutthroat',
      name: 'Cutthroat',
      tagline: 'Muggins is watching',
      description:
        'Same race, sharper claws: fail to claim your points at the table and your opponent takes them for you.',
      facts: ['muggins on', 'steal unclaimed points', 'no mercy'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      preset: 'cutthroat',
      art: [
        { label: '5♦', tint: ['#d06a7e', '#7c2c3e'] },
        { label: 'MUGGINS', tint: ['#d06a7e', '#7c2c3e'] },
        { label: '+2' },
      ],
    },
    {
      id: 'match-play',
      name: 'Match Play',
      tagline: 'Best of three boards',
      description:
        'A proper long evening: race to 121, reset the pegs, then do it again. First player to win two complete games takes the match.',
      facts: ['first to 2 games', 'dealer alternates', '~25–40 min'],
      accent: '#4ba9a6',
      shade: '#245d63',
      preset: 'match-play',
      art: [
        { label: '121', tint: ['#68c8bd', '#245d63'] },
        { label: '2–0' },
        { label: 'PEG', tint: ['#68c8bd', '#245d63'] },
      ],
    },
  ],
};
