import type { GameCatalogEntry } from '@parlour/engine';
import { orderScopaHand } from './cards';
import { scopaConfig, type ScopaRules } from './config';
import { scopaHowToPlay } from './howto';

/**
 * Scopa's entry on the parlour shelf. Mode ids match the config presets in
 * {@link scopaConfig}.
 */
export const scopaCatalog: GameCatalogEntry<ScopaRules> = {
  id: 'scopa',
  gameId: 'scopa',
  name: 'Scopa',
  subtitle: 'the fishing game',
  tagline: 'Sweep the table',
  description:
    'Capture cards off the table by match or by sum, hoard the golden coins, and hunt the settebello. Clear the whole table and call it a scopa — the sweetest word in Italian card rooms.',
  facts: ['2–6 players', 'capture · sums', 'solo or friends'],
  accent: '#b8862f',
  shade: '#5e3a12',
  art: [
    { label: '7♦', tint: ['#c9a13b', '#7a5a17'] },
    { label: 'A♦', tint: ['#b8862f', '#5e3a12'] },
    { label: 'SCO!' },
    { label: 'K♣', tint: ['#4a4a55', '#1d1d26'] },
  ],
  href: '/scopa',
  howToPlay: scopaHowToPlay,
  seats: [2, 3, 4, 6],
  configSchema: scopaConfig,
  handOrder: orderScopaHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'First to 11',
      description:
        'Scopa as played in every Italian bar: three cards at a time, four points a round, first to eleven.',
      facts: ['game to 11', '3-card deals', '~20 min'],
      accent: '#b8862f',
      shade: '#5e3a12',
      art: [{ label: '7♦', tint: ['#c9a13b', '#7a5a17'] }, { label: '11' }],
    },
    {
      id: 'lungo',
      preset: 'lungo',
      name: 'Lungo',
      tagline: 'The long game',
      description:
        'Same rules, race to twenty-one. Room for comebacks, grudges and legendary scope.',
      facts: ['game to 21', '3-card deals', '~40 min'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '21', tint: ['#4ba1ba', '#25586e'] },
        { label: 'A♦', tint: ['#b8862f', '#5e3a12'] },
      ],
    },
    {
      id: 'scopone',
      preset: 'scopone-preset',
      name: 'Scopone',
      tagline: 'Whole deck, no mercy',
      description:
        'The old-school four-hander: ten cards each dealt at once, no stock, nothing hidden. Every capture is a commitment.',
      facts: ['4 players · 2v2', 'whole deck', '~30 min'],
      accent: '#8a5aa8',
      shade: '#43265c',
      art: [
        { label: '10×4', tint: ['#8a5aa8', '#43265c'] },
        { label: '7♦', tint: ['#c9a13b', '#7a5a17'] },
      ],
    },
  ],
};
