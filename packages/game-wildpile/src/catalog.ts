import type { GameCatalogEntry } from '@parlour/engine';
import { orderWildpileHand } from './deck';
import { wildpileConfig, type WildpileRules } from './game';
import { wildpileHowToPlay } from './howto';

/**
 * Wild's entry on the parlour shelf. The app's game picker and mode picker are
 * generated from this, so presentation lives beside the rules it describes —
 * the mode ids here are the config presets in {@link wildpileConfig}.
 */
export const wildpileCatalog: GameCatalogEntry<WildpileRules> = {
  id: 'wild',
  gameId: 'wildpile',
  name: 'Wild',
  subtitle: 'the shedding game',
  tagline: 'Shed every card',
  description:
    'A 112-card riot of skips, reverses, draw-fours, color dumps and jump-ins. Same warm table, a much louder deck.',
  facts: ['2–4 players', 'timed deal', 'solo or friends'],
  accent: '#c8566b',
  shade: '#7c2c3e',
  art: [
    { label: '7', tint: ['#d95763', '#a3372c'] },
    { label: '⤺', tint: ['#e2b049', '#b07a1c'] },
    { label: '⊘', tint: ['#5fae7b', '#2f6b48'] },
    { label: '+4', tint: ['#4ba1ba', '#25586e'] },
  ],
  href: '/wild',
  howToPlay: wildpileHowToPlay,
  seats: [2, 3, 4],
  configSchema: wildpileConfig,
  handOrder: orderWildpileHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'By the book',
      description:
        'Match the color or the number, then drop a whole color at once. No stacking, no jump-ins — a polite riot.',
      facts: ['one deal', 'no stacking', '~5 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '7', tint: ['#d95763', '#a3372c'] },
        { label: '⤺', tint: ['#e2b049', '#b07a1c'] },
        { label: '⊘', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'party',
      preset: 'party',
      name: 'Party',
      tagline: 'Stack and slam',
      description:
        'Draw-twos and draw-fours pile up, and an exact match lets anyone jump in out of turn. Chaos, warmly lit.',
      facts: ['stacking on', 'jump-ins on', '~5 min'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [
        { label: '7', tint: ['#d95763', '#a3372c'] },
        { label: '+4', tint: ['#e2b049', '#b07a1c'] },
        { label: '⚡', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'houseRules',
      preset: 'houseRules',
      name: 'House Rules',
      tagline: 'Everything on',
      description:
        'Sevens trade hands, zeroes pass them along, swap-hand wilds join the deck, and a card you drew has to be played.',
      facts: ['7-0 swaps', 'swap wilds', 'force play'],
      accent: '#7f6bd0',
      shade: '#402f7a',
      art: [
        { label: '7', tint: ['#d95763', '#a3372c'] },
        { label: '⇄', tint: ['#e2b049', '#b07a1c'] },
        { label: '0', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
  ],
};
