import { defineGameCatalog } from '@parlour/engine';
import { orderEightsHand } from './cards';
import { eightsConfig } from './config';
import { eightsHowToPlay } from './howto';

/**
 * Crazy Eights' entry on the parlour shelf. The app's game picker and mode
 * picker are generated from this, so presentation lives beside the rules it
 * describes — the mode ids here are the config presets in {@link eightsConfig}.
 */
export const eightsCatalog = defineGameCatalog({
  id: 'eights',
  gameId: 'eights',
  name: 'Crazy Eights',
  subtitle: 'the wild-card shedder',
  tagline: 'Eights go anywhere',
  description:
    'One ordinary pack, one growing pile. Follow the suit or the rank, drop an eight to bend the table to a suit of your choosing, and charge everyone else for whatever they are still holding.',
  facts: ['2–6 players', 'play to a score', 'solo or friends'],
  accent: '#3f8f96',
  shade: '#1f4a52',
  art: [
    { label: '8♦', tint: ['#4ba1ba', '#25586e'] },
    { label: 'Q♠', tint: ['#3d4a6b', '#1d2438'] },
    { label: '2♥', tint: ['#c8566b', '#7c2c3e'] },
    { label: 'A♣', tint: ['#5fae7b', '#2f6b48'] },
  ],
  href: '/eights',
  howToPlay: eightsHowToPlay,
  seats: [2, 3, 4, 5, 6],
  configSchema: eightsConfig,
  handOrder: orderEightsHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Straight',
      tagline: 'Eights and nothing else',
      description:
        'The game as your grandmother dealt it. Match the suit or the rank, play an eight to call a suit, draw until something fits. First to 100.',
      facts: ['8s wild only', 'draw until playable', 'to 100'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: '8♦', tint: ['#4ba1ba', '#25586e'] },
        { label: '7♦', tint: ['#3d4a6b', '#1d2438'] },
        { label: '7♣', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'house',
      preset: 'house',
      name: 'House',
      tagline: 'Twos, queens and aces',
      description:
        'The rules almost everyone actually plays: twos hand out pickups, queens skip the next seat, aces turn the table around. First to 100.',
      facts: ['2 · Q · A live', 'no stacking', 'to 100'],
      accent: '#3f8f96',
      shade: '#1f4a52',
      art: [
        { label: '2♥', tint: ['#c8566b', '#7c2c3e'] },
        { label: 'Q♠', tint: ['#3d4a6b', '#1d2438'] },
        { label: '8♦', tint: ['#4ba1ba', '#25586e'] },
      ],
    },
    {
      id: 'chaos',
      preset: 'chaos',
      name: 'Crazy',
      tagline: 'Stack it up',
      description:
        'Twos pile onto twos until somebody swallows the lot, a card you drew has to be played, and one draw a turn is all you get. Long game, loud table.',
      facts: ['stacking on', 'force play', 'to 150'],
      accent: '#c8566b',
      shade: '#7c2c3e',
      art: [
        { label: '2♥', tint: ['#c8566b', '#7c2c3e'] },
        { label: '2♠', tint: ['#3d4a6b', '#1d2438'] },
        { label: '+6', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
  ],
});
