/**
 * The room vocabulary, and nothing else.
 *
 * This is a leaf module on purpose. Seat ranges, join routes, and the game
 * packs themselves are all keyed on `MultiplayerGameId` through total
 * `Record`s, and every one of those tables would otherwise have to import the
 * module that owns the packs — which imports the authority, which imports the
 * seat ranges. Keeping the id list here means each table depends on the
 * vocabulary rather than on the other tables.
 *
 * Saved match history is keyed on these ids. They are stable forever.
 */

export type MultiplayerGameId =
  | 'blitz'
  | 'cribbage'
  | 'wildpile'
  | 'ratscrew'
  | 'euchre'
  | 'hearts'
  | 'gin'
  | 'president'
  | 'spades'
  | 'ohhell'
  | 'ohhell';

export const MULTIPLAYER_GAME_IDS = [
  'blitz',
  'cribbage',
  'wildpile',
  'ratscrew',
  'euchre',
  'hearts',
  'gin',
  'president',
  'spades',
  'ohhell',
] as const satisfies readonly MultiplayerGameId[];

const KNOWN = new Set<string>(MULTIPLAYER_GAME_IDS);

export function isMultiplayerGameId(value: unknown): value is MultiplayerGameId {
  return typeof value === 'string' && KNOWN.has(value);
}
