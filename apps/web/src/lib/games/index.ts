/**
 * The game registry, in one place.
 *
 * `shelf` is what the pickers read (tiles, modes, rules sheets, the generated
 * settings panel). `gameRegistry` is what a friend room reads (defs, config
 * validation, authorities, bot turns). `tablePacks` is what a table page reads.
 * They are separate files because they are consumed by different layers, and
 * one barrel because "adding a game" should be one directory to visit.
 */

export * from './shelf';
export {
  findRoomGame,
  isMultiplayerGameId,
  roomGame,
  ALL_ROOM_GAMES,
  MULTIPLAYER_GAME_IDS,
  ROOM_GAMES,
  type MultiplayerGameId,
  type MultiplayerGameSession,
  type RoomGamePack,
  type RoomRuntime,
  type SessionAuthority,
} from '@/lib/rooms/gameRegistry';
