import { type MultiplayerGameId } from './gameIds';

/**
 * Where a joined guest lands, per game.
 *
 * This is a total `Record`, not a chain of ternaries with a fallback. The
 * fallback was the bug: a game missing from the chain did not fail, it quietly
 * sent every guest to the Blitz table. As a record, omitting a game is a
 * compile error, so the next one cannot be forgotten the same way.
 *
 * Kept as plain data, deliberately. The join page needs a route before it has
 * any reason to load nine game packs, so this must not import the registry —
 * the registry reads its routes from here instead.
 */
const TABLE_ROUTES: Record<MultiplayerGameId, string> = {
  blitz: '/table',
  cribbage: '/cribbage/table',
  wildpile: '/wild/table',
  eights: '/eights/table',
  ratscrew: '/ratscrew/table',
  euchre: '/euchre/table',
  hearts: '/hearts/table',
  gin: '/gin/table',
  president: '/president/table',
  spades: '/spades/table',
  poker: '/poker/table',
  ohhell: '/ohhell/table',
};

export function tableRouteFor(gameId: MultiplayerGameId): string {
  return TABLE_ROUTES[gameId];
}

export { TABLE_ROUTES };
