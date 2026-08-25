/**
 * Stale draft. Live rooms use `apps/web/src/lib/rooms/gameRegistry.ts`.
 * Friend rooms deal open; do not add a privacy tier here.
 *
 * The room-side game registry — one entry per game, replacing four parallel
 * `gameId === '…'` ladders.
 *
 * `roomSession.ts` used to answer four separate questions by walking four
 * separate if-chains: which `GameDef` does this room play, what does a valid
 * settings object look like, how is the session and its authority built, and
 * how wide is the seat ring. Every new game meant a new branch in each, and
 * nothing forced the four to stay in agreement — Spades refused veiled rooms in
 * one chain while another chain still handed it a veil spread.
 *
 * Here each game states those facts once. The important consequence is not the
 * line count: it is that the generics live *inside* an entry, so the room no
 * longer holds a nine-arm union of `GameDef`s and no longer needs the
 * `as never` casts that union forced at every call site.
 */

import {
  createSession,
  isVeilHandle,
  type ConfigSchema,
  type GameDef,
  type GameSession,
  type RuleValues,
  type SeatId,
  type VeilSupport,
} from '@parlour/engine';
import {
  blitzConfigSchema,
  createBlitzDef,
  type BlitzConfig,
  type BlitzState,
} from '@parlour/game-blitz';
import {
  createEuchreDef,
  euchreConfig,
  type EuchreRules,
  type EuchreState,
} from '@parlour/game-euchre';
import {
  presidentConfig,
  presidentGame,
  type PresidentRules,
  type PresidentState,
} from '@parlour/game-president';
import {
  wildpileConfig,
  wildpileGame,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import {
  ratscrewConfigSchema,
  ratscrewGame,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import {
  createEightsDef,
  eightsConfig,
  type EightsRules,
  type EightsState,
} from '@parlour/game-eights';
import {
  cribbageConfigSchema,
  createCribbageDef,
  type CribbageConfig,
  type CribbageState,
} from '@parlour/game-cribbage';
import {
  heartsConfigSchema,
  heartsGame,
  type HeartsRules,
  type HeartsState,
} from '@parlour/game-hearts';
import { createPokerDef, pokerConfig, type PokerRules, type PokerState } from '@parlour/game-poker';
import {
  createSpadesDef,
  spadesConfig,
  type SpadesRules,
  type SpadesState,
} from '@parlour/game-spades';
import {
  createGinMatchDef,
  ginConfigSchema,
  type GinConfig,
  type GinMatchState,
} from '@parlour/game-gin';
import { EngineAuthority } from '@/lib/multiplayer/EngineAuthority';
import type { AuthorityAdapter, RoomSettings } from '@/lib/multiplayer/types';
import { botTurns, type BotTurn } from '@/app/_multiplayer/botSeats';
import { seatRangeFor, type SeatRange } from '@/lib/rooms/seatRange';

/**
 * Every game a friend room can seat. Kept as a union of literals so a typo in a
 * route or an announcement is a compile error rather than a runtime surprise.
 */
export type MultiplayerGameId =
  | 'blitz'
  | 'cribbage'
  | 'wildpile'
  | 'eights'
  | 'ratscrew'
  | 'euchre'
  | 'hearts'
  | 'gin'
  | 'president'
  | 'spades'
  | 'poker';

export type MultiplayerGameSession =
  | GameSession<BlitzState, BlitzConfig>
  | GameSession<CribbageState, CribbageConfig>
  | GameSession<WildpileState, WildpileRules>
  | GameSession<EightsState, EightsRules>
  | GameSession<RatscrewState, RatscrewConfig>
  | GameSession<EuchreState, EuchreRules>
  | GameSession<HeartsState, HeartsRules>
  | GameSession<GinMatchState, GinConfig>
  | GameSession<PresidentState, PresidentRules>
  | GameSession<SpadesState, SpadesRules>
  | GameSession<PokerState, PokerRules>;

export type RoomAuthority = AuthorityAdapter & {
  getSession(): MultiplayerGameSession;
};

export interface RoomRuntime {
  session: MultiplayerGameSession;
  authority: RoomAuthority;
}

export interface RoomRuntimeArgs {
  settings: RoomSettings;
  seed: number;
  onSeatBot: (seat: number, bot: boolean) => void;
  /** ceremony order; present only once a veiled room has finished shuffling */
  deckOrder?: readonly string[];
}

/** What one game declares about being playable in a friend room. */
interface RoomGamePack<S, C extends RuleValues> {
  gameId: MultiplayerGameId;
  /**
   * A fresh def per room. Several packs are factories that close over bot
   * policies, so this is a function rather than a shared instance.
   */
  def(): GameDef<S, C>;
  configSchema: ConfigSchema<C>;
  /**
   * Why this game cannot run a veiled room. Stating it here is what stops a
   * room quietly downgrading to `open` while still showing a privacy badge —
   * the refusal is raised at settings time, in the player's words.
   */
  veilRefusal?: string;
  /** Room-only narrowing applied after the schema resolves a config. */
  roomConfig?(config: C): C;
  /**
   * An exact seat count stated in the game's own words, for games whose ring is
   * wider than the table they actually seat. Checked after the range so the
   * player gets the specific sentence rather than a bare pair of numbers.
   */
  seatsRefusal?: { seats: number; message: string };
  /**
   * The move that can exhaust the stock in a veiled room, forcing the spent
   * discard back under a fresh veil.
   *
   * Both games that do this keep the same two zones under the same names, and
   * both leave the top discard face up, so the rule reads the shape rather than
   * the game. Omit it for games that never recycle a pile.
   */
  recycleOn?: string;
}

/** The `{stock, discard}` shape a recycling game is expected to keep. */
interface RecyclableZones {
  stock: readonly string[];
  discard: readonly string[];
}

function hasRecyclableZones(state: unknown): state is RecyclableZones {
  if (state === null || typeof state !== 'object') return false;
  const zones = state as { stock?: unknown; discard?: unknown };
  return Array.isArray(zones.stock) && Array.isArray(zones.discard);
}

/**
 * The type-erased face of an entry. Only monomorphic operations cross this
 * boundary: the generics stay captured in the closures below, which is what
 * lets the room hold one registry instead of a union of nine game types.
 */
export interface RoomGameEntry {
  gameId: MultiplayerGameId;
  seats: SeatRange;
  /** null when this game can run veiled rooms; the refusal message otherwise */
  veilRefusal: string | null;
  /**
   * Veil deck support, or null when the game has not opted in. The returned
   * object's own methods take the config, so this does not need it.
   */
  veilSupport(): VeilSupport | null;
  /** Validates and canonicalises a room's settings, or throws saying why not. */
  resolveSettings(settings: RoomSettings): RoomSettings;
  createRuntime(args: RoomRuntimeArgs): RoomRuntime;
  /** Moves the bot seats should make right now, in this game's own rules. */
  botTurns(
    session: MultiplayerGameSession,
    view: unknown,
    botSeats: readonly SeatId[],
  ): readonly BotTurn[];
  /**
   * Public cards this move must exchange for a fresh hidden stock, or null when
   * it exchanges nothing.
   */
  recyclableCards(state: unknown, move: string): readonly string[] | null;
}

function defineRoomGame<S, C extends RuleValues>(pack: RoomGamePack<S, C>): RoomGameEntry {
  const { gameId, veilRefusal = null } = pack;
  const seats = seatRangeFor(gameId);

  return {
    gameId,
    seats,
    veilRefusal,

    veilSupport() {
      return pack.def().veil ?? null;
    },

    resolveSettings(settings) {
      const { min, max } = seats;
      if (!Number.isInteger(settings.seats) || settings.seats < min || settings.seats > max) {
        throw new Error(`rooms require ${min}–${max} seats for ${gameId}`);
      }
      if (pack.seatsRefusal && settings.seats !== pack.seatsRefusal.seats) {
        throw new Error(pack.seatsRefusal.message);
      }
      const resolved = pack.configSchema.resolve(settings.config as Partial<C>);
      return {
        gameId,
        seats: settings.seats,
        config: pack.roomConfig ? pack.roomConfig(resolved) : resolved,
        security: 'open',
      };
    },

    createRuntime({ settings, seed, onSeatBot, deckOrder }) {
      // A veiled deal needs the ceremony order, and the ceremony cannot run
      // until every seat is present. Until then the room sits on an ordinary
      // lobby deal that is never played and is marked `open`, so a joining peer
      // can replay the snapshot instead of choking on a veiled one with no
      // deck order.
      const veiled = settings.security === 'veil' && deckOrder !== undefined;
      const veil = veiled ? { veiled: true, deckOrder } : {};
      const runtimeSettings: RoomSettings = veiled
        ? settings
        : { ...settings, security: 'open' as const };
      const def = pack.def();
      const session = createSession(def, {
        seed,
        config: settings.config as C,
        seats: settings.seats,
        ...veil,
      });
      const authority = new EngineAuthority({
        def,
        session,
        settings: runtimeSettings,
        onSeatBot,
        seatsRange: seats,
      });
      return {
        session: session as unknown as MultiplayerGameSession,
        authority: authority as unknown as RoomAuthority,
      };
    },

    botTurns(session, view, botSeats) {
      return botTurns<S, C>({
        def: pack.def(),
        session: session as unknown as GameSession<S, C>,
        view: view as S,
        botSeats,
      });
    },

    recyclableCards(state, move) {
      if (pack.recycleOn !== move || !hasRecyclableZones(state)) return null;
      // The top discard stays face up and is not part of the exchange; below it
      // is the spent pile. Nothing to recycle until that pile has real faces in
      // it — a discard already all handles is a stock that never went public.
      if (state.stock.length > 0 || state.discard.length <= 1) return null;
      const cards = state.discard.slice(1);
      return cards.some((card) => !isVeilHandle(card)) ? cards : null;
    },
  };
}

const ROOM_GAMES: readonly RoomGameEntry[] = [
  defineRoomGame<BlitzState, BlitzConfig>({
    gameId: 'blitz',
    def: createBlitzDef,
    configSchema: blitzConfigSchema,
    recycleOn: 'draw.stock',
  }),
  defineRoomGame<WildpileState, WildpileRules>({
    gameId: 'wildpile',
    def: () => wildpileGame,
    configSchema: wildpileConfig,
    recycleOn: 'draw',
  }),
  defineRoomGame<EightsState, EightsRules>({
    gameId: 'eights',
    def: createEightsDef,
    configSchema: eightsConfig,
    // A round is scored from the face value of every hand left on the table, so
    // a veiled room could not settle one without opening every hand anyway.
    veilRefusal:
      'Crazy Eights friend rooms use open replay — scoring a round needs every hand face up',
  }),
  defineRoomGame<RatscrewState, RatscrewConfig>({
    gameId: 'ratscrew',
    def: () => ratscrewGame,
    configSchema: ratscrewConfigSchema,
  }),
  defineRoomGame<EuchreState, EuchreRules>({
    gameId: 'euchre',
    def: createEuchreDef,
    configSchema: euchreConfig,
  }),
  defineRoomGame<HeartsState, HeartsRules>({
    gameId: 'hearts',
    def: () => heartsGame,
    configSchema: heartsConfigSchema,
  }),
  defineRoomGame<GinMatchState, GinConfig>({
    gameId: 'gin',
    def: createGinMatchDef,
    configSchema: ginConfigSchema,
  }),
  defineRoomGame<PresidentState, PresidentRules>({
    gameId: 'president',
    def: () => presidentGame,
    configSchema: presidentConfig,
  }),
  defineRoomGame<SpadesState, SpadesRules>({
    gameId: 'spades',
    def: createSpadesDef,
    configSchema: spadesConfig,
    veilRefusal: 'Spades friend rooms use open replay — veiled Spades is not available',
  }),
  defineRoomGame<PokerState, PokerRules>({
    gameId: 'poker',
    def: createPokerDef,
    configSchema: pokerConfig,
    // Hold'em's hidden information is two cards a seat holds, and the room's
    // collaborative deal already stops a host stacking the deck. Veiled poker
    // additionally needs a mid-hand public open for the board, which the
    // transport does not have — so say so rather than imply privacy.
    veilRefusal: 'Poker friend rooms use open replay — veiled poker is not available',
  }),
  defineRoomGame<CribbageState, CribbageConfig>({
    gameId: 'cribbage',
    def: createCribbageDef,
    configSchema: cribbageConfigSchema,
    veilRefusal: 'Cribbage friend rooms use open replay until multi-deal re-veiling ships',
    seatsRefusal: { seats: 2, message: 'Cribbage rooms require exactly two seats' },
    // Friend rooms currently represent one replayable GameSession. Match Play
    // is deliberately solo until room snapshots carry MatchSession round logs,
    // so never let a forged announcement imply best-of-three.
    roomConfig: (config) => ({ ...config, gamesToWin: 1 }),
  }),
];

const BY_ID = new Map<string, RoomGameEntry>(ROOM_GAMES.map((entry) => [entry.gameId, entry]));

export function isMultiplayerGameId(value: unknown): value is MultiplayerGameId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** The registry entry for a room's game, or throws naming the unknown id. */
export function roomGame(gameId: string): RoomGameEntry {
  const entry = BY_ID.get(gameId);
  if (!entry) throw new Error(`unsupported room game: ${gameId}`);
  return entry;
}

export function roomGameOrNull(gameId: string | null | undefined): RoomGameEntry | null {
  return gameId ? (BY_ID.get(gameId) ?? null) : null;
}

export const ROOM_GAME_IDS: readonly MultiplayerGameId[] = ROOM_GAMES.map((entry) => entry.gameId);
