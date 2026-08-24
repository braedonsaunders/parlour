import { modePreset, type GameCatalogEntry, type GameMode } from '@parlour/engine';
import { blitzCatalog } from '@parlour/game-blitz';
import { wildpileCatalog } from '@parlour/game-wildpile';

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
export type GameId = 'blitz' | 'wild';

const SHELF: readonly GameCatalogEntry[] = [
  blitzCatalog as GameCatalogEntry,
  wildpileCatalog as GameCatalogEntry,
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
