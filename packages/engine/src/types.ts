/**
 * @parlour/engine — pinned public contracts.
 *
 * This file is the cross-slice API contract (spec BUILD-SPEC.md §4).
 * Slice workers may EXTEND it; breaking renames require orchestrator sign-off.
 *
 * Purity rules (enforced by eslint): no DOM, no network, no Date.now,
 * no new Date(), no Math.random. Randomness ONLY via Rng.
 */

import type { CardRecycle, VeilSupport } from './veil';

export type SeatId = number;
export type CardId = string;

/** Optional live facts a game pack may use while arranging a player's hand. */
export type HandOrderContext = Readonly<Record<string, unknown>>;

/**
 * Pure presentation ordering for a player's hand. It must return every input
 * card exactly once and must not mutate the authoritative engine zone.
 */
export type HandOrder = (cards: readonly CardId[], context: HandOrderContext) => readonly CardId[];

export type CardComparator = (left: CardId, right: CardId) => number;

// ---------------------------------------------------------------------------
// RNG (seeded, deterministic — the ONLY randomness source)
// ---------------------------------------------------------------------------

export interface Rng {
  int(maxExclusive: number): number;
  float(): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
  fork(salt: string | number): Rng;
  getState(): unknown;
  setState(state: unknown): void;
}

export function rngSeedFrom(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// FX timeline (spec §4.1: UI animates ONLY from these hints)
// ---------------------------------------------------------------------------

export interface FxEvent<P = unknown> {
  kind: string;
  payload: P;
  /** relative ms offset from the moment the move applied */
  at?: number;
}

export interface FxEmitter {
  emit<P>(kind: string, payload?: P, at?: number): void;
  events: FxEvent[];
}

export function createFx(): FxEmitter {
  const events: FxEvent[] = [];
  return {
    events,
    emit<P>(kind: string, payload?: P, at?: number): void {
      events.push(at === undefined ? { kind, payload } : { kind, payload, at });
    },
  };
}

/** Canonical fx kinds. Workers may ADD namespaced kinds; never rename these. */
export const Fx = {
  DealCard: 'card.fly', // {card, from:'stock'|'discard', to:`hand:${seat}`, dur}
  DrawCard: 'card.draw', // {card, seat, from:'stock'|'discard'}
  DiscardCard: 'card.discard', // {card, seat, to:'discard'}
  FlipCard: 'card.flip', // {card, seat|'discard'}
  ShuffleStock: 'stock.shuffle', // {}
  TurnRing: 'turn.ring', // {seat}
  Knock: 'burst.knock', // {seat}
  Blitz: 'burst.blitz', // {seat, handValue}
  ChipLoss: 'chip.loss', // {seat, livesLeft}
  ShowdownReveal: 'showdown.reveal', // {seat, handValue}
  RoundEnd: 'round.end', // {reason}
} as const;

export type FxKind = (typeof Fx)[keyof typeof Fx];

// ---------------------------------------------------------------------------
// Moves & flow
// ---------------------------------------------------------------------------

export interface RuleError {
  code: string;
  message: string;
}

export interface MoveCtx {
  rng: Rng;
  fx: FxEmitter;
  /**
   * Replay-stable facts about the event currently being reduced. `atMs` is an
   * authority-supplied match-relative timestamp, never a clock read performed
   * by engine code. Real-time rules may consult it because it is persisted in
   * the event log and supplied again during replay.
   */
  event: {
    seq: number;
    atMs?: number;
  };
  /**
   * Present when this move is re-veiling a spent pile. `issue` is the new,
   * secret order the reducer must install; `retire` names the cards it is
   * replacing. Nothing pairs the two — that mapping is what stays hidden.
   */
  recycle?: CardRecycle;
}

/** Replay-relevant metadata supplied by the transport authority. */
export interface ApplyMeta {
  /** Non-negative, monotonic, authority-normalized milliseconds. */
  atMs?: number;
  /**
   * Veil openings applied immediately before this move (spec:
   * docs/VEILED-DECK-PROTOCOL.md). Each pair swaps an opaque handle for the
   * card face behind it. The runtime records them on the event, so a replay
   * reproduces the same board without ever learning a card that stayed hidden.
   */
  reveals?: readonly (readonly [CardId, CardId])[];
  /**
   * A spent pile going back under the veil: public cards retired, fresh handles
   * issued in the order a new shuffle ceremony produced. The move places them;
   * the runtime checks the exchange conserved the deck.
   */
  recycle?: CardRecycle;
}

/** Replay metadata a move may need while deciding whether an action is valid. */
export interface MoveValidationCtx {
  /** Present when the authority has completed a fresh Veil epoch for this move. */
  recycle?: CardRecycle;
}

export interface Move<S> {
  validate(state: S, seat: SeatId, payload: unknown, ctx?: MoveValidationCtx): true | RuleError;
  apply(state: S, seat: SeatId, payload: unknown, ctx: MoveCtx): S;
}

export interface LegalMove {
  id: string;
  payload?: unknown;
  hint?: string;
}

export interface PhaseState {
  phase: string;
  actor: SeatId | null;
  /**
   * Seats that may act concurrently this phase (simultaneous decisions:
   * jump-ins, slaps, secret picks). When present and non-empty it supersedes
   * `actor` for turn-gating; keep `actor` as the "primary" seat (or null) so
   * single-actor callers keep working. The authority serializes arrivals into
   * the log, so replay stays deterministic — "first to slap" is simply the
   * slap event that landed first.
   */
  actors?: readonly SeatId[];
  round: number;
  label?: string;
}

/** Every seat allowed to act in this phase (multi-actor aware). */
export function actingSeats(phase: PhaseState): readonly SeatId[] {
  if (phase.actors && phase.actors.length > 0) return phase.actors;
  return phase.actor === null ? [] : [phase.actor];
}

export function isActingSeat(phase: PhaseState, seat: SeatId): boolean {
  return actingSeats(phase).includes(seat);
}

export interface AutoMove {
  seat: SeatId | null;
  move: string;
  payload?: unknown;
  reason: string;
}

export interface FlowAdvance {
  phase: PhaseState;
  /** moves the runtime must apply+log immediately after the triggering event */
  autoMoves?: AutoMove[];
  ended?: MatchResult;
}

export interface Flow<S> {
  start(state: S, seats: number): PhaseState;
  legalMoves(state: S, phase: PhaseState): readonly LegalMove[];
  /**
   * Per-seat enumeration for simultaneous phases (`phase.actors`). When absent
   * the runtime falls back to `legalMoves` for every acting seat.
   */
  legalMovesFor?(state: S, phase: PhaseState, seat: SeatId): readonly LegalMove[];
  /** compute the next phase/actor after an applied event; pure */
  advance(state: S, event: AppliedEvent, seats: number): FlowAdvance;
  /**
   * Opt-in gate for transport-injected system events (`sessionInject`), e.g.
   * authoritative clock ticks for timed rules. Injection is refused when this
   * hook is absent — wall-clock time enters the engine ONLY through a move the
   * game explicitly accepts, and only via the log (so replay reproduces it).
   */
  canInject?(
    state: S,
    phase: PhaseState,
    moveId: string,
    payload: unknown,
    meta: Readonly<ApplyMeta>,
  ): true | RuleError;
}

// ---------------------------------------------------------------------------
// Event log & replay (spec §4.1: state = replay(seed, log))
// ---------------------------------------------------------------------------

export interface AppliedEvent {
  seq: number;
  /** null for system/auto events */
  seat: SeatId | null;
  move: string;
  payload?: unknown;
  /** wall-clock stamp added by transports OUTSIDE determinism; never replayed into state */
  ts?: number;
  /**
   * Authority-normalized match time that IS replayed into MoveCtx. Unlike
   * `ts`, this is deterministic game input and must be monotonic in the log.
   */
  atMs?: number;
  automatic?: boolean;
  /**
   * True for events injected by the transport via `sessionInject` (e.g. clock
   * ticks). Unlike `ts`, an injected payload IS part of the deterministic log:
   * once the authority logs it, every replay reproduces it bit-for-bit.
   */
  injected?: boolean;
  /**
   * Veil openings applied before this event's move. Part of the deterministic
   * log: replay re-applies them in order, so a veiled round replays exactly.
   */
  reveals?: readonly (readonly [CardId, CardId])[];
  /** The stock recycle this event performed. Replayed exactly, so the new order holds. */
  recycle?: CardRecycle;
  hash?: string;
}

/**
 * A logged event that did not survive re-checking against the rules.
 *
 * Ordinary replay trusts the log (see `replaySession`). `verify` mode does not:
 * it re-runs legality and validation for every player action, which is what a
 * peer needs when the "authority" that produced the log is another player
 * rather than a server it controls.
 */
export interface ReplayFault {
  /** index of the offending event in the supplied log */
  index: number;
  seq: number;
  seat: SeatId | null;
  move: string;
  error: RuleError;
}

export interface MatchResultRank {
  seat: SeatId;
  rank: number;
  detail?: Record<string, number | string | boolean>;
}

export interface MatchResult {
  winner: SeatId | null;
  rankings: MatchResultRank[];
  reason: string;
}

// ---------------------------------------------------------------------------
// Rule config schema (room settings UI is GENERATED from this)
// ---------------------------------------------------------------------------

export type ConfigFieldValue = boolean | number | string;

/**
 * Presentation hints shared by every field kind. The generated settings UI reads
 * them; rule evaluation never does, so they are safe to add to any game.
 */
export interface ConfigFieldMeta {
  /** One line of plain-language explanation shown under the label. */
  help?: string;
  /** Section heading the generated UI groups this field under. */
  group?: string;
  /** Hidden behind the "advanced" disclosure — house rules, not table basics. */
  advanced?: boolean;
}

export type ConfigField = ConfigFieldMeta &
  (
    | { key: string; kind: 'toggle'; label: string; default: boolean }
    | {
        key: string;
        kind: 'enum';
        label: string;
        options: readonly { value: ConfigFieldValue; label: string }[];
        default: ConfigFieldValue;
      }
    | {
        key: string;
        kind: 'int';
        label: string;
        min: number;
        max: number;
        default: number;
      }
  );

export type RuleValues = Record<string, ConfigFieldValue>;

export interface ConfigPreset<C extends RuleValues> {
  id: string;
  label: string;
  values: Partial<C>;
}

export interface ConfigSchema<C extends RuleValues> {
  fields: readonly ConfigField[];
  presets: readonly ConfigPreset<C>[];
  defaults(): C;
  resolve(values: Partial<C>): C;
}

// ---------------------------------------------------------------------------
// Decks, cards, zones
// ---------------------------------------------------------------------------

export interface CardFace {
  label: string;
  short: string;
  suit?: string;
  rank?: number | string;
  color?: string;
  meta?: Record<string, unknown>;
}

export interface DeckDef {
  id: string;
  cardIds: readonly CardId[];
  faces: Readonly<Record<CardId, CardFace>>;
}

/** standard 52-card deck id helper: e.g. 'S12' = Q♠ */
export function stdDeck(): DeckDef {
  const suits = ['S', 'H', 'D', 'C'] as const;
  const suitNames: Record<(typeof suits)[number], string> = {
    S: 'spades',
    H: 'hearts',
    D: 'diamonds',
    C: 'clubs',
  };
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const cardIds: CardId[] = [];
  const faces: Record<CardId, CardFace> = {};
  for (const s of suits) {
    for (let r = 0; r < ranks.length; r++) {
      const id = `${s}${r + 1}`;
      cardIds.push(id);
      faces[id] = {
        label: `${ranks[r]}${s}`,
        short: String(ranks[r]),
        suit: suitNames[s],
        rank: r + 1,
        color: s === 'H' || s === 'D' ? 'red' : 'black',
      };
    }
  }
  return { id: 'std-52', cardIds, faces };
}

// ---------------------------------------------------------------------------
// Bots (engine clients — same API as humans)
// ---------------------------------------------------------------------------

export interface PersonaMeta {
  name: string;
  avatar: string;
  blurb: string;
  emotes?: readonly string[];
}

export interface BotPolicy<S> {
  id: string;
  label: string;
  tier: 1 | 2 | 3;
  persona?: PersonaMeta;
  chooseMove(
    view: S,
    seat: SeatId,
    legal: readonly LegalMove[],
    rng: Rng,
    ctx: { thinkMs: () => number },
  ): LegalMove | null;
}

// ---------------------------------------------------------------------------
// How-to-play docs (each game pack ships its own full instructions; the app
// renders them verbatim in the per-game "?" help modal — no markdown parsing)
// ---------------------------------------------------------------------------

export interface HowToPlaySection {
  heading: string;
  /** short paragraphs shown under the heading */
  body?: readonly string[];
  /** bullet list shown after the paragraphs (rules, card effects, toggles…) */
  bullets?: readonly { label: string; text: string }[];
}

export interface HowToPlayDoc {
  /** one-line pitch shown at the top of the help modal */
  summary: string;
  /** what winning means, stated in one or two sentences */
  objective: string;
  sections: readonly HowToPlaySection[];
}

// ---------------------------------------------------------------------------
// Shelf catalog (the app's game picker and mode picker are generated from this)
// ---------------------------------------------------------------------------

/**
 * One card face in a tile's artwork. Packs describe the art; the app draws it,
 * so a new game needs no changes to the picker to look like itself.
 */
export interface GameArtCard {
  /** Short face text — "A♠", "+4", "31". */
  label: string;
  /** Gradient stops for a loud card. Omit to draw the muted paper card. */
  tint?: readonly [string, string];
}

/** A selectable way to play a game: a config preset plus how it is sold. */
export interface GameMode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Short param lines shown on the tile. */
  facts: readonly string[];
  accent: string;
  shade: string;
  /**
   * Config preset applied when the mode is chosen. Omit when a mode is a match
   * *format* rather than a rule set — Blitz's formats and its house-rule
   * presets are orthogonal, so its modes carry none.
   */
  preset?: string;
  /** Faces previewed on the mode tile. */
  art?: readonly GameArtCard[];
  /**
   * Names a bespoke tile illustration instead of a card fan. The app draws the
   * motifs it knows and falls back to `art`, so a pack can reach for a richer
   * picture without the picker having to know which game asked for it.
   */
  motif?: string;
}

/**
 * A game pack's entry on the parlour shelf. Everything the picker screens
 * render comes from here, so adding a game is adding one of these and one line
 * to the app's registry — no picker code changes.
 */
export interface GameCatalogEntry<C extends RuleValues = RuleValues> {
  /**
   * Shelf id — the app's routing and match-history vocabulary. Stable forever
   * once shipped, because saved matches are keyed on it.
   */
  id: string;
  /** The pack's `GameDef.id`, used to open a table. Often the same as `id`. */
  gameId: string;
  name: string;
  /** Trailing qualifier on the shelf, e.g. "the 31 game". */
  subtitle: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
  /** Cards fanned on the shelf tile. */
  art: readonly GameArtCard[];
  /** Route the shelf sends players to; null keeps the game "coming soon". */
  href: string | null;
  howToPlay: HowToPlayDoc;
  modes: readonly GameMode[];
  /** Seat counts the table supports, in the order the picker offers them. */
  seats: readonly number[];
  /** Drives the generated rule-settings panel. */
  configSchema: ConfigSchema<C>;
  /** Game-owned, presentation-only ordering used by every playable hand rail. */
  handOrder: HandOrder;
}

/** The config preset a mode selects, or null to take the schema defaults. */
export function modePreset(mode: GameMode): string | null {
  return mode.preset ?? null;
}

// ---------------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------------

export interface SetupCtx<C extends RuleValues> {
  config: C;
  seats: number;
  rng: Rng;
  fx: FxEmitter;
  /** true when the room runs the Veil privacy protocol (hands dealt as handles) */
  veiled?: boolean;
  /**
   * Ceremony-supplied deck order for veiled rooms. Every entry is an opaque
   * handle except the setup cards the room opened in public. Deal from it with
   * `dealOrder(ctx, deck)` instead of `shuffledIds(deck, rng)`.
   */
  deckOrder?: readonly CardId[];
}

export interface GameDef<S, C extends RuleValues> {
  id: string;
  configSchema: ConfigSchema<C>;
  /** full player-facing instructions; rendered by the app's per-game help modal */
  howToPlay: HowToPlayDoc;
  setup(ctx: SetupCtx<C>): S;
  moves: Record<string, Move<S>>;
  flow: Flow<S>;
  playerView(state: S, seat: SeatId): S;
  end(state: S): MatchResult | null;
  bots: readonly BotPolicy<S>[];
  /**
   * Opt-in support for veiled (hidden-hand) rooms. Absent means the game can
   * only be played in the open tier — the room UI must say so rather than
   * silently claiming privacy it does not have.
   */
  veil?: VeilSupport;
}

// ---------------------------------------------------------------------------
// Session runtime (implemented by engine; signatures pinned here)
// ---------------------------------------------------------------------------

export interface ApplyOutcome<S, C extends RuleValues = RuleValues> {
  events: AppliedEvent[];
  fx: FxEvent[];
  session: GameSession<S, C>;
  rejected?: RuleError;
}

export interface GameSession<S, C extends RuleValues = RuleValues> {
  def: GameDef<S, C>;
  seed: number;
  config: C;
  seats: number;
  log: readonly AppliedEvent[];
  state: S;
  phase: PhaseState;
  status: 'playing' | 'ended';
  result: MatchResult | null;
  botsEnabled(seat: SeatId): boolean;
  /** fx emitted by def.setup — the opening deal animation */
  setupFx?: readonly FxEvent[];
  /**
   * Hash of the most recently applied event.
   *
   * This is a 32-bit FNV-1a checksum over canonical JSON: it is a **desync
   * detector, not a tamper detector**. It reliably catches two peers whose
   * state drifted apart, and it is trivially forgeable by a peer that wants to
   * make a doctored log look consistent. Use `replaySession(..., {verify:true})`
   * — not this hash — when the question is "did the authority cheat".
   */
  lastAppliedHash?: string | null;
  /**
   * Highest authority time seen in the log so far, cached so that admitting an
   * event is O(1) rather than a backwards scan of the whole log.
   */
  lastAtMs?: number;
  /**
   * The first logged event that failed re-validation, or null when the log was
   * either clean or never verified. Only ever set by `verify` replay.
   */
  fault?: ReplayFault | null;
  /** true when this round was dealt under Veil */
  veiled?: boolean;
  /** the ceremony deck order this round was dealt from (veiled rooms only) */
  deckOrder?: readonly CardId[];
}

export interface SessionOptions<C extends RuleValues> {
  seed: number;
  config: C;
  seats: number;
  /** run the round under Veil: hands are dealt as opaque handles */
  veiled?: boolean;
  /** ceremony deck order for veiled rooms; required whenever `veiled` is set */
  deckOrder?: readonly CardId[];
}

/**
 * Runtime signatures, pinned as types instead of `declare function`.
 *
 * These were ambient declarations, which meant nothing checked them against
 * runtime.ts/rng.ts — the two could drift silently, and importing one straight
 * from this module handed back a binding with no implementation behind it.
 * As types they are inert at runtime, and runtime.test.ts asserts each
 * implementation is assignable to its contract, so drift is now a type error.
 */
export type StateHashFn = (state: unknown) => string;

export type MakeRngFn = (seed: number) => Rng;

export type CreateSessionFn = <S, C extends RuleValues>(
  def: GameDef<S, C>,
  opts: SessionOptions<C>,
) => GameSession<S, C>;

export type SessionApplyFn = <S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
  meta?: ApplyMeta,
) => ApplyOutcome<S, C>;

export type SessionInjectFn = <S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  moveId: string,
  payload?: unknown,
  meta?: ApplyMeta,
) => ApplyOutcome<S, C>;

export interface ReplayOptions<C extends RuleValues> {
  config?: C;
  /**
   * Seat count the log was produced at. Always pass it: a log where the last
   * seat never acted cannot be told apart from a smaller table, so omitting it
   * is an error rather than a guess.
   */
  seats?: number;
  veiled?: boolean;
  deckOrder?: readonly CardId[];
  /**
   * Re-check every logged player action against `flow.legalMoves` and
   * `move.validate` instead of trusting the authority that produced it. The
   * first failure stops the replay and lands on `session.fault`.
   */
  verify?: boolean;
}

export type ReplaySessionFn = <S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: ReplayOptions<C>,
) => GameSession<S, C>;

export type VerifyLogFn = <S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: ReplayOptions<C>,
) => ReplayFault | null;
