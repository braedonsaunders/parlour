export type GameId = 'blitz' | 'wild' | 'euchre';

export type GamePreviewKind = 'blitz-fan' | 'wild-fan' | 'euchre-fan';

export interface GameDef {
  id: GameId;
  name: string;
  subtitle: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
  preview: GamePreviewKind;
  /** Route choosing this game leads to; null while the game is still on the shelf. */
  href: string | null;
}

/**
 * The parlour shelf — every game the engine hosts. Both games support local
 * bots and friend rooms through the shared multiplayer transport.
 */
export const GAMES: readonly GameDef[] = [
  {
    id: 'blitz',
    name: 'Blitz',
    subtitle: 'the 31 game',
    tagline: 'Chase thirty-one',
    description:
      'Draw, swap, and knock your way to 31 in one suit. Three match formats, sly bots, and one very loud celebration.',
    facts: ['2–4 players', 'classic · fast · timed', 'solo or friends'],
    accent: '#e29349',
    shade: '#96471c',
    preview: 'blitz-fan',
    href: '/play',
  },
  {
    id: 'wild',
    name: 'Wild',
    subtitle: 'the shedding game',
    tagline: 'Shed every card',
    description:
      'A 108-card riot of skips, reverses, draw-fours and jump-ins. Same warm table, a much louder deck.',
    facts: ['2–4 players', 'action cards', 'solo or friends'],
    accent: '#c8566b',
    shade: '#7c2c3e',
    preview: 'wild-fan',
    href: '/wild',
  },
  {
    id: 'euchre',
    name: 'Euchre',
    subtitle: 'the partner game',
    tagline: 'Take tricks for your team',
    description:
      'Order it up, name your trump, and chase bowers with the player across the table. First team to ten takes the match.',
    facts: ['4 players · 2v2', 'trick-taking', 'solo or friends'],
    accent: '#5fae7b',
    shade: '#2f6b48',
    preview: 'euchre-fan',
    href: '/euchre',
  },
];

const BY_ID = new Map(GAMES.map((game) => [game.id, game]));

export function getGame(id: GameId): GameDef {
  const game = BY_ID.get(id);
  if (!game) throw new Error(`unknown game id: ${id}`);
  return game;
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && BY_ID.has(value as GameId);
}
