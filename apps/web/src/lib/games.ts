import { modePreset, type GameCatalogEntry, type GameMode, type RuleValues } from '@parlour/engine';
import { blitzCatalog } from '@parlour/game-blitz';
import { cribbageCatalog } from '@parlour/game-cribbage';
import { euchreCatalog } from '@parlour/game-euchre';
import { ginCatalog } from '@parlour/game-gin';
import { heartsCatalog } from '@parlour/game-hearts';
import { presidentCatalog } from '@parlour/game-president';
import { wildpileCatalog } from '@parlour/game-wildpile';
import { ratscrewCatalog } from '@parlour/game-ratscrew';

/**
 * Pack catalogs are generic over their rule config. `ConfigSchema<C>` is
 * invariant in C, so `GameCatalogEntry<BlitzConfig>` is not assignable to
 * `GameCatalogEntry` (defaults to `RuleValues`). This is a centralized
 * existential widening at the registry edge — one cast, not eight, and not
 * a closed type hole. Closing it for real belongs in `@parlour/engine` via a
 * non-generic presentation view. Identity is preserved so callers can still
 * `===` a pack catalog.
 */
function shelfEntry<C extends RuleValues>(entry: GameCatalogEntry<C>): GameCatalogEntry {
  return entry as GameCatalogEntry;
}

/**
 * The parlour shelf.
 *
 * Every picker screen — game select, mode select, seat counts, the rules sheet,
 * and the generated settings panel — reads from this registry, and each entry
 * is owned by the game pack that it describes. Shipping a new game is:
 *
 *   1. export a `GameCatalogEntry` from the pack (copy the shape from
 *      `packages/game-blitz/src/catalog.ts`), then
 *   2. add it to `SHELF` below and add its `id` to `GameId`.
 *
 * The picker screens themselves need no changes. `GameId` stays an explicit
 * union because saved match history is keyed on it — a typo there would
 * silently orphan someone's results rather than fail the build.
 */
export type GameId =
  'blitz' | 'cribbage' | 'wild' | 'ratscrew' | 'euchre' | 'hearts' | 'gin' | 'president';

const SHELF: readonly GameCatalogEntry[] = [
  shelfEntry(blitzCatalog),
  shelfEntry(cribbageCatalog),
  shelfEntry(wildpileCatalog),
  shelfEntry(ratscrewCatalog),
  shelfEntry(euchreCatalog),
  shelfEntry(heartsCatalog),
  shelfEntry(ginCatalog),
  shelfEntry(presidentCatalog),
];

export type { GameCatalogEntry, GameMode };
export { modePreset };

export const GAMES = SHELF;

const BY_ID = new Map(SHELF.map((game) => [game.id, game]));

export function getGame(id: string): GameCatalogEntry {
  const game = BY_ID.get(id);
  if (!game) throw new Error(`unknown game id: ${id}`);
  return game;
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Every mode a game offers, in the order its pack lists them. */
export function gameModes(id: string): readonly GameMode[] {
  return getGame(id).modes;
}

export function getGameMode(gameId: string, modeId: string): GameMode {
  const mode = getGame(gameId).modes.find((candidate) => candidate.id === modeId);
  if (!mode) throw new Error(`unknown ${gameId} mode id: ${modeId}`);
  return mode;
}

export function isGameModeId(gameId: string, value: unknown): boolean {
  return typeof value === 'string' && getGame(gameId).modes.some((mode) => mode.id === value);
}
