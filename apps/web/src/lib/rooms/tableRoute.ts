import { MULTIPLAYER_GAME_IDS, type MultiplayerGameId } from './gameIds';

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
  scopa: '/scopa/table',
  spite: '/spite/table',
  durak: '/durak/table',
  palace: '/palace/table',
  pinochle: '/pinochle/table',
};

export function tableRouteFor(gameId: MultiplayerGameId): string {
  return TABLE_ROUTES[gameId];
}

/**
 * The URL segment a game owns, or null for one that owns no segment.
 *
 * Read off the table route rather than kept as a second list, because the two
 * must agree and a game whose id is not its segment is exactly where that
 * breaks: Wild Pile is `wildpile` in the room vocabulary and `wild` in the URL,
 * and the create route generated straight off the game id put its lobby at
 * `/wildpile/create` while the shelf went on linking to `/wild/create`.
 *
 * Blitz answers null: its table is `/table` and its room is `/create`, both
 * unsegmented, from before there was a second game to generalise from.
 */
export function roomSegmentFor(gameId: MultiplayerGameId): string | null {
  const parts = TABLE_ROUTES[gameId].split('/').filter(Boolean);
  return parts.length === 2 && parts[1] === 'table' ? (parts[0] as string) : null;
}

/**
 * The URL segments `app/[game]/create/page.tsx` builds a route for.
 *
 * It lives HERE, in the leaf, and not beside the create screens — because the
 * route that reads it is a server component, and `generateStaticParams` runs
 * during page-data collection. The screen table imports every setup store, and
 * those are `'use client'`; reaching them from the server is not a lint nit but
 * a hard build failure ("Attempted to call defineRulesSetup() from the server").
 * The route needs the vocabulary, not the screens, so the vocabulary is what it
 * gets to import.
 *
 * Blitz is absent because it owns no segment: its room has lived at `/create`
 * since before there was a second game to generalise from.
 */
export const CREATE_ROUTE_SEGMENTS: readonly string[] = MULTIPLAYER_GAME_IDS.map(
  roomSegmentFor,
).filter((segment): segment is string => segment !== null);

/** The game that owns a URL segment, or null. */
export function gameForRoomSegment(segment: string): MultiplayerGameId | null {
  return (
    (Object.keys(TABLE_ROUTES) as MultiplayerGameId[]).find(
      (id) => roomSegmentFor(id) === segment,
    ) ?? null
  );
}

export { TABLE_ROUTES };
