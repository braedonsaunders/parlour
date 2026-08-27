/**
 * The one place a game becomes a *room*.
 *
 * Before this file, adding a game to friend rooms meant editing five separate
 * chains keyed on `settings.gameId`: a def lookup, a settings resolver, a
 * runtime builder, a seat range, and a join route. Several of them ended in a
 * fallback — `return createBlitzDef()` — so a game added to some and forgotten
 * in the others did not fail. It quietly played Blitz's rules in a Spades room.
 *
 * `tableRoute.ts` already fixed its own copy of that bug by becoming a total
 * `Record`, and left a comment saying so. This is that same lesson applied to
 * the rest of it: omit a game and the `Record<MultiplayerGameId, RoomGamePack>`
 * below is a compile error. There is no fallback left to be wrong about.
 *
 * Each entry is written through {@link definePack}, which is generic over the
 * pack's own `(State, Config)`. That keeps every cast next to the concrete
 * types it is about, and lets the registry expose an erased surface the room
 * layer consumes without knowing which game it holds.
 */

import {
  createSession,
  VEILED_REDEAL_PENDING,
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
  cribbageConfigSchema,
  createCribbageDef,
  type CribbageConfig,
  type CribbageState,
} from '@parlour/game-cribbage';
import {
  createEuchreDef,
  euchreConfig,
  type EuchreRules,
  type EuchreState,
} from '@parlour/game-euchre';
import {
  createGinMatchDef,
  ginConfigSchema,
  type GinConfig,
  type GinMatchState,
} from '@parlour/game-gin';
import {
  heartsConfigSchema,
  heartsGame,
  type HeartsRules,
  type HeartsState,
} from '@parlour/game-hearts';
import {
  presidentConfig,
  presidentGame,
  type PresidentRules,
  type PresidentState,
} from '@parlour/game-president';
import {
  ratscrewConfigSchema,
  ratscrewGame,
  type RatscrewConfig,
  type RatscrewState,
} from '@parlour/game-ratscrew';
import {
  createSpadesDef,
  spadesConfig,
  type SpadesRules,
  type SpadesState,
} from '@parlour/game-spades';
import {
  createEightsDef,
  eightsConfig,
  type EightsRules,
  type EightsState,
} from '@parlour/game-eights';
import { ohhellConfig, ohhellGame, type OhHellRules, type OhHellState } from '@parlour/game-ohhell';
import { createPokerDef, pokerConfig, type PokerRules, type PokerState } from '@parlour/game-poker';
import { createScopaDef, scopaConfig, type ScopaRules, type ScopaState } from '@parlour/game-scopa';
import { spiteConfig, spiteGame, type SpiteRules, type SpiteState } from '@parlour/game-spite';
import { createDurakDef, durakConfig, type DurakRules, type DurakState } from '@parlour/game-durak';
import {
  createPalaceDef,
  palaceConfig,
  type PalaceRules,
  type PalaceState,
} from '@parlour/game-palace';
import {
  createPinochleDef,
  pinochleConfig,
  type PinochleRules,
  type PinochleState,
} from '@parlour/game-pinochle';
import {
  wildpileConfig,
  wildpileGame,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import { botTurns, type BotTurn } from '@/app/_multiplayer/botSeats';
import { EngineAuthority } from '@/lib/multiplayer/EngineAuthority';
import type { AuthorityAdapter, RoomSecurity, RoomSettings } from '@/lib/multiplayer/types';
import { isMultiplayerGameId, MULTIPLAYER_GAME_IDS, type MultiplayerGameId } from './gameIds';
import { seatRangeFor, type SeatRange } from './seatRange';
import { tableRouteFor } from './tableRoute';

export { isMultiplayerGameId, MULTIPLAYER_GAME_IDS, type MultiplayerGameId } from './gameIds';
export type { SeatRange } from './seatRange';

/** Every session shape a room can hold — derived from the packs, not restated. */
export type MultiplayerGameSession =
  | GameSession<BlitzState, BlitzConfig>
  | GameSession<CribbageState, CribbageConfig>
  | GameSession<WildpileState, WildpileRules>
  | GameSession<RatscrewState, RatscrewConfig>
  | GameSession<EuchreState, EuchreRules>
  | GameSession<HeartsState, HeartsRules>
  | GameSession<GinMatchState, GinConfig>
  | GameSession<PresidentState, PresidentRules>
  | GameSession<SpadesState, SpadesRules>
  | GameSession<EightsState, EightsRules>
  | GameSession<PokerState, PokerRules>
  | GameSession<OhHellState, OhHellRules>
  | GameSession<ScopaState, ScopaRules>
  | GameSession<SpiteState, SpiteRules>
  | GameSession<DurakState, DurakRules>
  | GameSession<PalaceState, PalaceRules>
  | GameSession<PinochleState, PinochleRules>;

export type SessionAuthority = AuthorityAdapter & {
  getSession(): MultiplayerGameSession;
};

// ---------------------------------------------------------------------------
// The erased pack surface the room layer consumes
// ---------------------------------------------------------------------------

export interface RoomRuntimeInput {
  settings: RoomSettings;
  seed: number;
  onSeatBot: (seat: number, bot: boolean) => void;
  /** Ceremony deck order; present only once a veiled round is ready to deal. */
  deckOrder?: readonly string[];
}

export interface RoomRuntime {
  session: MultiplayerGameSession;
  authority: SessionAuthority;
}

export interface BotTurnInput {
  session: MultiplayerGameSession;
  /** State to reason over — under Veil, already resolved with readable faces. */
  view: unknown;
  botSeats: readonly SeatId[];
}

export interface RoomGamePack {
  readonly id: MultiplayerGameId;
  /** Player-facing name, used in the refusals the room UI shows. */
  readonly name: string;
  /** Where a joined guest lands. */
  readonly route: string;
  readonly seats: SeatRange;
  /** Canonicalises a room's rule values, including any room-only clamp. */
  resolveConfig(config: unknown): RuleValues;
  /** The pack's Veil support block, or `null` when it has none. */
  veilSupport(): VeilSupport | null;
  createRuntime(input: RoomRuntimeInput): RoomRuntime;
  /** Moves the host should play for bot-held seats right now. */
  botTurns(input: BotTurnInput): BotTurn[];
  /**
   * The public cards `move` is about to turn back into hidden stock, or null
   * when it is not that kind of move.
   *
   * Only games that recycle a spent discard need this. It lived in the room
   * session as another `gameId === 'blitz' | 'wildpile'` chain — the same
   * factory tax in miniature, with the same silent-omission risk for game ten.
   */
  recyclableStock(state: unknown, move: string): readonly string[] | null;
  /**
   * The cards this seat is holding that only it may read.
   *
   * A veiled room opens these privately as soon as they are dealt, and it
   * cannot guess where they live: most games keep them in `hands`, but a poker
   * seat holds `hole` cards and a crazy eights hand is nested inside the round
   * on the table. Asking the pack is the only thing that works for all three.
   */
  privateHandles(state: unknown, seat: number): readonly string[];
  /**
   * Cards this game is waiting to have opened in public, and the move that
   * consumes them — a hold'em board, or a showdown. Null almost always.
   */
  publicOpenPending(state: unknown): { handles: readonly string[]; move: string } | null;
  /**
   * The move that deals this game another hand inside the same session, or
   * null when a room is only ever one deal.
   */
  readonly redealMove: string | null;
  /**
   * True when the game is waiting for a deck the room has to shuffle for it.
   *
   * A veiled deal is one ceremony over one deck, so a match spanning several
   * hands needs a ceremony per hand — and the room cannot read a game's state
   * to know a hand has ended, which is the whole point of this boundary. The
   * game says so through its own validation instead, and the answer is this
   * one boolean rather than a rule error the room would have to interpret.
   */
  redealPending(state: unknown): boolean;
}

/**
 * Shared shape for "the stock ran dry, flip the discard back under it": every
 * card of the discard except the face-up top, but only when at least one of
 * them is still a public face that a new epoch could hide.
 */
function spentDiscard(state: {
  stock: readonly string[];
  discard: readonly string[];
}): readonly string[] | null {
  if (state.stock.length > 0 || state.discard.length <= 1) return null;
  const cards = state.discard.slice(1);
  return cards.some((card) => !isVeilHandle(card)) ? cards : null;
}

interface PackSpec<S, C extends RuleValues> {
  id: MultiplayerGameId;
  name: string;
  configSchema: ConfigSchema<C>;
  createDef(): GameDef<S, C>;
  /**
   * Room-only narrowing applied after the schema resolves. Cribbage friend
   * rooms are a single replayable `GameSession`, so a forged announcement must
   * never be able to imply best-of-three.
   */
  clampConfig?(config: C): C;
  /** See {@link RoomGamePack.recyclableStock}. */
  recyclableStock?(state: S, move: string): readonly string[] | null;
  /** See {@link RoomGamePack.privateHandles}. */
  privateHandles?(state: S, seat: number): readonly string[];
}

/**
 * Erases one pack's `(State, Config)` behind {@link RoomGamePack}.
 *
 * Every cast in the registry lives here, in a function that still knows both
 * concrete types. The room layer gets a homogeneous record and never casts.
 */
function definePack<S, C extends RuleValues>(spec: PackSpec<S, C>): RoomGamePack {
  const resolveConfig = (config: unknown): C => {
    const resolved = spec.configSchema.resolve(config as Partial<C>);
    return spec.clampConfig ? spec.clampConfig(resolved) : resolved;
  };
  // Capacity is declared once, in seatRange.ts, because the transport has to
  // read it from a raw announcement string before any pack is resolved.
  const seats: SeatRange = seatRangeFor(spec.id);

  return {
    id: spec.id,
    name: spec.name,
    route: tableRouteFor(spec.id),
    seats,
    resolveConfig,
    veilSupport: () => spec.createDef().veil ?? null,
    redealMove: spec.createDef().veil?.redealMove ?? null,

    redealPending(state) {
      const def = spec.createDef();
      const move = def.veil?.redealMove;
      if (!move) return false;
      const verdict = def.moves[move]?.validate(state as S, 0 as SeatId, undefined);
      return verdict !== undefined && verdict !== true && verdict.code === VEILED_REDEAL_PENDING;
    },

    createRuntime({ settings, seed, onSeatBot, deckOrder }) {
      // A veiled deal needs the ceremony order, and the ceremony cannot run
      // until every seat is present. Until then the room sits on an ordinary
      // lobby deal that is never played and is marked `open`, so a joining peer
      // can replay the snapshot instead of choking on a veiled one with no
      // deck order.
      const veiled = settings.security === 'veil' && deckOrder !== undefined;
      const runtimeSettings: RoomSettings = veiled
        ? settings
        : { ...settings, security: 'open' as RoomSecurity };
      const def = spec.createDef();
      const session = createSession(def, {
        seed,
        config: settings.config as C,
        seats: settings.seats,
        ...(veiled ? { veiled: true, deckOrder } : {}),
      });
      const authority = new EngineAuthority({
        def,
        session,
        settings: runtimeSettings,
        onSeatBot,
        seatsRange: seats,
      });
      // `GameSession` is invariant in its type arguments, so a concrete session
      // is not *assignable* to the union even though it is a member of it.
      // Widening through `unknown` is the honest way to say "this is the arm of
      // the union for this pack" — and it happens exactly here, where both
      // types are still known, instead of at nine call sites.
      return {
        session: session as unknown as MultiplayerGameSession,
        authority: authority as unknown as SessionAuthority,
      };
    },

    botTurns({ session, view, botSeats }) {
      return botTurns({
        def: spec.createDef(),
        session: session as unknown as GameSession<S, C>,
        view: view as S,
        botSeats,
      });
    },

    recyclableStock(state, move) {
      return spec.recyclableStock ? spec.recyclableStock(state as S, move) : null;
    },
    privateHandles(state, seat) {
      if (spec.privateHandles) return spec.privateHandles(state as S, seat);
      const hands = (state as { hands?: unknown }).hands;
      const mine = Array.isArray(hands) ? hands[seat] : null;
      return Array.isArray(mine) ? (mine as string[]) : [];
    },
    publicOpenPending(state) {
      const opens = spec.createDef().veil?.publicOpens?.(state);
      return opens && opens.handles.length > 0 ? opens : null;
    },
  };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const ROOM_GAMES: Record<MultiplayerGameId, RoomGamePack> = {
  blitz: definePack<BlitzState, BlitzConfig>({
    id: 'blitz',
    name: 'Blitz',
    configSchema: blitzConfigSchema,
    createDef: createBlitzDef,
    recyclableStock: (state, move) => (move === 'draw.stock' ? spentDiscard(state) : null),
  }),

  cribbage: definePack<CribbageState, CribbageConfig>({
    id: 'cribbage',
    name: 'Cribbage',
    configSchema: cribbageConfigSchema,
    createDef: createCribbageDef,
    clampConfig: (config) => ({ ...config, gamesToWin: 1 }),
  }),

  wildpile: definePack<WildpileState, WildpileRules>({
    id: 'wildpile',
    name: 'Wild',
    configSchema: wildpileConfig,
    createDef: () => wildpileGame,
    recyclableStock: (state, move) => (move === 'draw' ? spentDiscard(state) : null),
  }),

  ratscrew: definePack<RatscrewState, RatscrewConfig>({
    id: 'ratscrew',
    name: 'Egyptian Ratscrew',
    configSchema: ratscrewConfigSchema,
    createDef: () => ratscrewGame,
  }),

  euchre: definePack<EuchreState, EuchreRules>({
    id: 'euchre',
    name: 'Euchre',
    configSchema: euchreConfig,
    createDef: createEuchreDef,
  }),

  hearts: definePack<HeartsState, HeartsRules>({
    id: 'hearts',
    name: 'Hearts',
    configSchema: heartsConfigSchema,
    createDef: () => heartsGame,
  }),

  gin: definePack<GinMatchState, GinConfig>({
    id: 'gin',
    name: 'Gin Rummy',
    configSchema: ginConfigSchema,
    createDef: createGinMatchDef,
    // Gin is the one match-shaped pack: its cards live one level down, so the
    // default `state.hands` accessor reads nothing and a veiled table would
    // deal hands nobody could peel.
    privateHandles: (state, seat) => state.hand.hands[seat] ?? [],
  }),

  president: definePack<PresidentState, PresidentRules>({
    id: 'president',
    name: 'President',
    configSchema: presidentConfig,
    createDef: () => presidentGame,
  }),

  spades: definePack<SpadesState, SpadesRules>({
    id: 'spades',
    name: 'Spades',
    configSchema: spadesConfig,
    createDef: createSpadesDef,
  }),

  eights: definePack<EightsState, EightsRules>({
    id: 'eights',
    name: 'Crazy Eights',
    configSchema: eightsConfig,
    createDef: createEightsDef,
    privateHandles: (state, seat) => state.round.hands[seat] ?? [],
    // The round is scored on what everyone is still holding, which a closed
    // hand cannot answer — so a veiled round opens every hand still in play
    // before it settles, and the pack waits in a reveal phase until it has.
    recyclableStock: (state, move) => (move === 'draw' ? spentDiscard(state.round) : null),
  }),

  poker: definePack<PokerState, PokerRules>({
    id: 'poker',
    name: 'Poker',
    configSchema: pokerConfig,
    createDef: createPokerDef,
    // Hold'em is the one game here that keeps turning cards mid-hand, so the
    // board and the showdown are opened in public a street at a time — see
    // `publicOpens` on the pack's veil block.
    privateHandles: (state, seat) => state.hole[seat] ?? [],
  }),

  ohhell: definePack<OhHellState, OhHellRules>({
    id: 'ohhell',
    name: 'Oh Hell!',
    configSchema: ohhellConfig,
    createDef: () => ohhellGame,
  }),

  scopa: definePack<ScopaState, ScopaRules>({
    id: 'scopa',
    name: 'Scopa',
    configSchema: scopaConfig,
    createDef: createScopaDef,
  }),

  spite: definePack<SpiteState, SpiteRules>({
    id: 'spite',
    name: 'Spite & Malice',
    configSchema: spiteConfig,
    createDef: () => spiteGame,
  }),

  durak: definePack<DurakState, DurakRules>({
    id: 'durak',
    name: 'Durak',
    configSchema: durakConfig,
    createDef: createDurakDef,
  }),

  palace: definePack<PalaceState, PalaceRules>({
    id: 'palace',
    name: 'Palace',
    configSchema: palaceConfig,
    createDef: createPalaceDef,
    privateHandles: (state, seat) => [...(state.hands[seat] ?? []), ...(state.down[seat] ?? [])],
  }),

  pinochle: definePack<PinochleState, PinochleRules>({
    id: 'pinochle',
    name: 'Pinochle',
    configSchema: pinochleConfig,
    createDef: createPinochleDef,
  }),
};

/**
 * The pack a room's settings name.
 *
 * Throws on an unknown id rather than defaulting. A room announcement arrives
 * over the network from a peer that may be running a different build; loading
 * *some other game's* rules for it is the one outcome worse than refusing.
 */
export function roomGame(gameId: string): RoomGamePack {
  if (!isMultiplayerGameId(gameId)) throw new Error(`unsupported room game: ${gameId}`);
  return ROOM_GAMES[gameId];
}

/** The pack, or null — for callers that must tolerate an unknown id. */
export function findRoomGame(gameId: string | null | undefined): RoomGamePack | null {
  return isMultiplayerGameId(gameId) ? ROOM_GAMES[gameId] : null;
}

/**
 * The refusal shown when a room announcement carries an impossible seat count.
 *
 * Generated from the pack rather than written per game, so a new title gets a
 * correctly-worded message for free instead of inheriting whichever nearby
 * game's sentence was copied.
 */
export function seatRefusal(pack: RoomGamePack): string {
  const { min, max, allowed } = pack.seats;
  if (allowed && allowed.length > 0) {
    return `${pack.name} rooms seat ${formatSeatList(allowed)}.`;
  }
  return min === max
    ? `${pack.name} rooms seat exactly ${min}.`
    : `${pack.name} rooms seat ${min}–${max}.`;
}

function formatSeatList(seats: readonly number[]): string {
  if (seats.length === 1) return String(seats[0]);
  if (seats.length === 2) return `${seats[0]} or ${seats[1]}`;
  return `${seats.slice(0, -1).join(', ')} or ${seats[seats.length - 1]}`;
}

/** Every pack, in registry order — for exhaustive tests and tooling. */
export const ALL_ROOM_GAMES: readonly RoomGamePack[] = MULTIPLAYER_GAME_IDS.map(
  (id) => ROOM_GAMES[id],
);
