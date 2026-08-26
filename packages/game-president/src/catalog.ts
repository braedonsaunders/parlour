import { defineGameCatalog } from '@parlour/engine';
import { orderPresidentHand } from './deck';
import { MAX_SEATS, MIN_SEATS } from './game';
import { presidentConfig } from './config';
import { presidentHowToPlay } from './howto';

/**
 * President's entry on the parlour shelf. The app's game picker and mode
 * picker are generated from this, so presentation lives beside the rules it
 * describes — the mode ids here are the config presets in
 * {@link presidentConfig}.
 */
export const presidentCatalog = defineGameCatalog({
  id: 'president',
  gameId: 'president',
  name: 'President',
  subtitle: 'the climbing game',
  tagline: 'Climb to the crown',
  description:
    'Top the pile with a bigger set, dump your hand first, and rise from Scum to President. Up to eight chairs, crowns and stings included.',
  facts: [`${MIN_SEATS}–${MAX_SEATS} players`, 'roles & trading', 'solo or friends'],
  accent: '#d9a441',
  shade: '#8a5c14',
  art: [
    { label: '3', tint: ['#7c5cb4', '#45306e'] },
    { label: '♛', tint: ['#e2b049', '#b07a1c'] },
    { label: '2', tint: ['#b34a67', '#74263f'] },
  ],
  href: '/president',
  howToPlay: presidentHowToPlay,
  seats: [MIN_SEATS, 5, 6, 7, MAX_SEATS],
  configSchema: presidentConfig,
  handOrder: orderPresidentHand,
  modes: [
    {
      id: 'classic',
      preset: 'classic',
      name: 'Classic',
      tagline: 'The full ladder',
      description:
        'Crowns, tributes and comebacks — first to eleven points takes the parlour. The way the pub plays it.',
      facts: ['first to 11', 'trading on', '2 clears'],
      accent: '#d9a441',
      shade: '#8a5c14',
      art: [
        { label: '3', tint: ['#7c5cb4', '#45306e'] },
        { label: '♛', tint: ['#e2b049', '#b07a1c'] },
        { label: 'A', tint: ['#b34a67', '#74263f'] },
      ],
    },
    {
      id: 'rapid',
      preset: 'rapid',
      name: 'Rapid',
      tagline: 'Short and spicy',
      description:
        'First to seven keeps the table moving. Same rules, fewer deals, louder comebacks.',
      facts: ['first to 7', '~10 min', 'great at 6+'],
      accent: '#c2593f',
      shade: '#7a2f1f',
      art: [
        { label: '5', tint: ['#d95763', '#a3372c'] },
        { label: '⚡', tint: ['#e2b049', '#b07a1c'] },
        { label: 'K', tint: ['#5fae7b', '#2f6b48'] },
      ],
    },
    {
      id: 'marathon',
      preset: 'marathon',
      name: 'Marathon',
      tagline: 'Long reigns',
      description:
        'Twenty-one points of politics. Scums become presidents, dynasties rise and fall.',
      facts: ['first to 21', 'long session', 'full arc'],
      accent: '#4ba1ba',
      shade: '#25586e',
      art: [
        { label: 'Q', tint: ['#4ba1ba', '#25586e'] },
        { label: '∞', tint: ['#7f6bd0', '#402f7a'] },
        { label: '2', tint: ['#e2b049', '#b07a1c'] },
      ],
    },
  ],
});
