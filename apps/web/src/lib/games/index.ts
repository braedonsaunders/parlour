/**
 * The game registry, in one place.
 *
 * `shelf` is what the pickers read (tiles, modes, rules sheets, the generated
 * settings panel). `roomRegistry` is what a friend room reads (defs, config
 * validation, authorities, bot turns). `tablePacks` is what a table page reads.
 * They are separate files because they are consumed by different layers, and
 * one barrel because "adding a game" should be one directory to visit.
 */

export * from './shelf';
export {
  isMultiplayerGameId,
  roomGame,
  roomGameOrNull,
  ROOM_GAME_IDS,
  type MultiplayerGameId,
  type MultiplayerGameSession,
  type RoomAuthority,
  type RoomGameEntry,
  type RoomRuntime,
} from './roomRegistry';
