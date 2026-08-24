import { describe, expect, it } from 'vitest';
import { filterGames } from './gameSearch';

const GAMES = [
  {
    id: 'wild',
    name: 'Wild',
    subtitle: 'the shedding game',
    tagline: 'Shed every card',
    description: 'Race through colours and action cards.',
    facts: ['2–4 players', 'solo or friends'],
  },
  {
    id: 'euchre',
    name: 'Euchre',
    subtitle: 'the partner game',
    tagline: 'Take tricks for your team',
    description: 'Call trump and work with your partner.',
    facts: ['4 players · 2v2', 'trick-taking'],
  },
  {
    id: 'gin',
    name: 'Gin',
    subtitle: 'the rummy classic',
    tagline: 'Meld, knock, win the night',
    description: 'Build clean runs and sets before you knock.',
    facts: ['2 players', 'solo or friends'],
  },
] as const;

describe('game search', () => {
  it('returns the complete shelf for an empty query', () => {
    expect(filterGames(GAMES, '   ')).toBe(GAMES);
  });

  it('matches names, game types, descriptions, and fact chips without case sensitivity', () => {
    expect(filterGames(GAMES, 'WILD').map((game) => game.id)).toEqual(['wild']);
    expect(filterGames(GAMES, 'shedding').map((game) => game.id)).toEqual(['wild']);
    expect(filterGames(GAMES, 'TRICK taking').map((game) => game.id)).toEqual(['euchre']);
    expect(filterGames(GAMES, 'clean runs').map((game) => game.id)).toEqual(['gin']);
  });

  it('requires every search term to match the same game', () => {
    expect(filterGames(GAMES, 'partner trump').map((game) => game.id)).toEqual(['euchre']);
    expect(filterGames(GAMES, 'partner shedding')).toEqual([]);
  });
});
