/**
 * @parlour/engine — pinned public contracts.
 *
 * This file is the cross-slice API contract (spec BUILD-SPEC.md §4).
 * Slice workers may EXTEND it; breaking renames require orchestrator sign-off.
 *
 * Purity rules (enforced by eslint): no DOM, no network, no Date.now,
 * no new Date(), no Math.random. Randomness ONLY via Rng.
 */

export type SeatId = number;
export type CardId = string;

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
}

/** Replay-relevant metadata supplied by the transport authority. */
export interface ApplyMeta {
  /** Non-negative, monotonic, authority-normalized milliseconds. */
  atMs?: number;
}

export interface Move<S> {
  validate(state: S, seat: SeatId, payload: unknown): true | RuleError;
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
  hash?: string;
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

export type ConfigField =
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
    };

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
// Game definition
// ---------------------------------------------------------------------------

export interface SetupCtx<C extends RuleValues> {
  config: C;
  seats: number;
  rng: Rng;
  fx: FxEmitter;
}

export interface GameDef<S, C extends RuleValues> {
  id: string;
  configSchema: ConfigSchema<C>;
  setup(ctx: SetupCtx<C>): S;
  moves: Record<string, Move<S>>;
  flow: Flow<S>;
  playerView(state: S, seat: SeatId): S;
  end(state: S): MatchResult | null;
  bots: readonly BotPolicy<S>[];
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
  /** hash of the most recently applied event; compare to a log tail to detect divergence */
  lastAppliedHash?: string | null;
}

export declare function stateHash(state: unknown): string;
export declare function createSession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  opts: { seed: number; config: C; seats: number },
): GameSession<S, C>;
export declare function sessionApply<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  seat: SeatId,
  moveId: string,
  payload?: unknown,
  meta?: ApplyMeta,
): ApplyOutcome<S, C>;
export declare function sessionInject<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  moveId: string,
  payload?: unknown,
  meta?: ApplyMeta,
): ApplyOutcome<S, C>;
export declare function replaySession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  seed: number,
  log: readonly AppliedEvent[],
  opts?: { config?: C; seats?: number },
): GameSession<S, C>;
export declare function makeRng(seed: number): Rng;
