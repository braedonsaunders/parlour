/**
 * Veil handles — the engine half of the Parlour Veil privacy protocol
 * (apps/web/src/lib/multiplayer/veil).
 *
 * A veiled room deals *handles* instead of card faces. The public reducer keeps
 * owning turn order, counts, zones and every visible card; it simply never sees
 * the face of a card that has not been opened yet. When a card becomes public —
 * played, discarded, flipped, shown down — the acting client supplies the
 * `(handle, cardId)` mapping alongside its move. The runtime substitutes the
 * handle for the real id before validation, and records the mapping in the
 * event log so replay reproduces the round bit-for-bit.
 *
 * Everything here is pure: the cryptography that decides *whether* a reveal is
 * honest lives in the web transport, not in the engine.
 */

import type { CardId, DeckDef, RuleError, Rng, RuleValues, SeatId } from './types';
import { shuffledIds } from './zones';

/** Reserved prefix. No real deck may mint card ids that start with it. */
export const VEIL_HANDLE_PREFIX = 'v#';

/** Opaque stand-in for the card at deck position `index`. */
export function veilHandle(index: number): CardId {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`veil handle index must be a non-negative integer: ${index}`);
  }
  return `${VEIL_HANDLE_PREFIX}${index}`;
}

export function isVeilHandle(value: unknown): value is CardId {
  return typeof value === 'string' && value.startsWith(VEIL_HANDLE_PREFIX);
}

/** Deck position behind a handle, or null when `value` is not a handle. */
export function veilHandleIndex(value: unknown): number | null {
  if (!isVeilHandle(value)) return null;
  const raw = value.slice(VEIL_HANDLE_PREFIX.length);
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  return Number(raw);
}

/** `[v#0 … v#(count-1)]` — the opaque deck order before any public opening. */
export function veilHandles(count: number): CardId[] {
  if (!Number.isInteger(count) || count < 0) throw new Error('veil deck size must be a count');
  return Array.from({ length: count }, (_, index) => veilHandle(index));
}

export function hasVeiledCard(cards: readonly CardId[]): boolean {
  return cards.some(isVeilHandle);
}

/** A single opening: the handle that was dealt, and the face behind it. */
export type CardReveal = readonly [handle: CardId, card: CardId];

// ---------------------------------------------------------------------------
// Structural substitution
// ---------------------------------------------------------------------------

/**
 * Replaces every occurrence of a handle string anywhere in a state tree.
 *
 * Card ids live in zones (`stock`, `discard`, `hands[]`, `piles[]`) but games
 * also park them in scalars (`drawnFromDiscard`, `interrupt.card`) and in
 * records (`pickups[].card`). A structural walk keeps the substitution
 * game-agnostic: handles carry a reserved prefix, so no non-card string can
 * collide with one. Unchanged subtrees keep their identity so React memoisation
 * and `stateHash` stay cheap.
 */
export function substituteCardIds<T>(value: T, mapping: ReadonlyMap<CardId, CardId>): T {
  if (mapping.size === 0) return value;
  return substitute(value, mapping) as T;
}

function substitute(value: unknown, mapping: ReadonlyMap<CardId, CardId>): unknown {
  if (typeof value === 'string') return mapping.get(value) ?? value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const mapped = substitute(entry, mapping);
      if (mapped !== entry) changed = true;
      return mapped;
    });
    return changed ? next : value;
  }
  const source = value as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    const mapped = substitute(entry, mapping);
    if (mapped !== entry) changed = true;
    next[key] = mapped;
  }
  return changed ? next : value;
}

/** True when `id` appears as a string anywhere in the state tree. */
export function stateContainsCardId(value: unknown, id: CardId): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'string') {
      if (current === id) return true;
      continue;
    }
    if (current === null || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const entry of current) pending.push(entry);
      continue;
    }
    for (const entry of Object.values(current as Record<string, unknown>)) pending.push(entry);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Reveal validation
// ---------------------------------------------------------------------------

function revealError(code: string, message: string): RuleError {
  return { code, message };
}

/**
 * Structural checks every reveal must pass before the runtime will apply it.
 *
 * These are the *conservation* rules: a handle that was never dealt cannot be
 * opened, a handle cannot be opened twice, and no opening may mint a card the
 * table can already see. Proving that the face is the one the shuffle ceremony
 * actually committed to is the transport's job — this is the part that keeps
 * replay sound even if the crypto layer is bypassed in tests.
 */
export function validateReveals(state: unknown, reveals: readonly CardReveal[]): RuleError | null {
  const handles = new Set<string>();
  const cards = new Set<string>();
  for (const reveal of reveals) {
    if (!Array.isArray(reveal) || reveal.length !== 2) {
      return revealError('bad-reveal', 'each reveal must be a [handle, card] pair');
    }
    const [handle, card] = reveal;
    if (typeof handle !== 'string' || typeof card !== 'string' || card.length === 0) {
      return revealError('bad-reveal', 'reveal entries must be card ids');
    }
    if (veilHandleIndex(handle) === null) {
      return revealError('not-a-handle', `${handle} is not a veil handle`);
    }
    if (isVeilHandle(card)) {
      return revealError('reveal-to-handle', `${handle} cannot be opened to another handle`);
    }
    if (handles.has(handle)) {
      return revealError('duplicate-reveal', `${handle} is opened twice in one move`);
    }
    if (cards.has(card)) {
      return revealError('duplicate-card', `${card} is revealed twice in one move`);
    }
    if (!stateContainsCardId(state, handle)) {
      return revealError('unknown-handle', `${handle} is not in play`);
    }
    if (stateContainsCardId(state, card)) {
      return revealError('card-already-open', `${card} is already visible at the table`);
    }
    handles.add(handle);
    cards.add(card);
  }
  return null;
}

/** Applies validated reveals. Callers must run {@link validateReveals} first. */
export function applyReveals<S>(state: S, reveals: readonly CardReveal[]): S {
  if (reveals.length === 0) return state;
  return substituteCardIds(state, new Map(reveals));
}

/**
 * Sending a spent pile back under the veil.
 *
 * The obvious primitive — "card X becomes handle H" — is worthless. Writing
 * that pairing into the log publishes exactly the thing the re-veil exists to
 * hide, and a public reshuffle of the relabelled handles keeps it readable.
 *
 * So a recycle never declares a pairing. It retires a set of public cards and
 * issues a list of fresh handles whose order came out of a new shuffle
 * ceremony. Which retired card sits behind which issued handle is known to
 * nobody — that is the point — while the table still knows *which* cards are in
 * the stock, exactly as it would in a physical game.
 */
export interface CardRecycle {
  /** public cards leaving the table */
  retire: readonly CardId[];
  /** fresh handles entering, in the order the new ceremony produced */
  issue: readonly CardId[];
}

/**
 * Structural checks for a recycle, run before the move that places the handles.
 *
 * `minHandleIndex` keeps a new epoch's handles clear of the ones already spent,
 * so a retired handle can never be quietly reused to mean a different card.
 */
export function validateRecycle(
  state: unknown,
  recycle: CardRecycle,
  minHandleIndex = 0,
): RuleError | null {
  const { retire, issue } = recycle;
  if (!Array.isArray(retire) || !Array.isArray(issue)) {
    return revealError('bad-recycle', 'a recycle needs a retire list and an issue list');
  }
  if (retire.length === 0) {
    return revealError('empty-recycle', 'a recycle must retire at least one card');
  }
  if (retire.length !== issue.length) {
    return revealError(
      'recycle-not-conserved',
      `retiring ${retire.length} cards cannot issue ${issue.length} handles`,
    );
  }

  const seenCards = new Set<string>();
  for (const card of retire) {
    if (typeof card !== 'string' || card.length === 0 || isVeilHandle(card)) {
      return revealError('bad-recycle', `${String(card)} is not a public card`);
    }
    if (seenCards.has(card)) {
      return revealError('duplicate-retire', `${card} is retired twice`);
    }
    if (!stateContainsCardId(state, card)) {
      return revealError('unknown-card', `${card} is not in play`);
    }
    seenCards.add(card);
  }

  const seenHandles = new Set<string>();
  for (const handle of issue) {
    const index = veilHandleIndex(handle);
    if (index === null) {
      return revealError('not-a-handle', `${String(handle)} is not a veil handle`);
    }
    if (index < minHandleIndex) {
      return revealError(
        'stale-handle',
        `${handle} reuses a handle from an earlier deck epoch (need index ≥ ${minHandleIndex})`,
      );
    }
    if (seenHandles.has(handle)) {
      return revealError('duplicate-handle', `${handle} is issued twice`);
    }
    if (stateContainsCardId(state, handle)) {
      return revealError('handle-in-use', `${handle} is already in play`);
    }
    seenHandles.add(handle);
  }
  return null;
}

/**
 * Applies a recycle exchange to a spent draw pile, preserving stragglers.
 *
 * The exchange was cut when the ceremony started, and the table kept playing
 * while it ran: cards landed on the discard AFTER the cut, so the pile the
 * exchange arrives at is usually a superset of the one it was made for. Those
 * stragglers are already public — hiding them was never possible, the epoch
 * does not cover them — so they simply stay on the discard, face up, for the
 * NEXT recycle to sweep. What the exchange does cover is swapped exactly:
 * every retired card leaves the pile, the issued handles become the stock.
 *
 * Returns null when the exchange cannot apply — a retired card is not in the
 * spent pile (it moved to a hand through some later play) or the stock is not
 * actually empty. The caller should refuse the move cleanly rather than throw.
 */
export function recycleSpentPile(
  stock: readonly CardId[],
  discard: readonly CardId[],
  recycle: CardRecycle,
): { stock: CardId[]; discard: CardId[] } | null {
  if (stock.length > 0 || discard.length <= 1) return null;
  const [top, ...spent] = discard;
  const retired = new Set(recycle.retire);
  if (recycle.retire.some((card) => !spent.includes(card))) return null;
  const stragglers = spent.filter((card) => !retired.has(card));
  return {
    stock: [...recycle.issue],
    discard: top === undefined ? [...stragglers] : [top, ...stragglers],
  };
}

/**
 * Conservation check run *after* the move placed the handles. A reducer that
 * left a retired card on the table, or dropped an issued handle, has silently
 * changed the deck — better to fail loudly than to play on with a board the
 * audit will reject at match end.
 */
export function recycleSettled(state: unknown, recycle: CardRecycle): RuleError | null {
  for (const card of recycle.retire) {
    if (stateContainsCardId(state, card)) {
      return revealError('retire-not-applied', `${card} is still on the table after the recycle`);
    }
  }
  for (const handle of recycle.issue) {
    if (!stateContainsCardId(state, handle)) {
      return revealError('issue-not-applied', `${handle} never reached the table`);
    }
  }
  return null;
}

/**
 * Local resolution: overlays every face this client legitimately knows (its own
 * dealt cards, plus everything already public) onto the shared state. The
 * result is what the UI renders and what legal-move enumeration runs against —
 * the shared state itself keeps the handles.
 */
export function resolveVeiledState<S>(state: S, known: ReadonlyMap<CardId, CardId>): S {
  if (known.size === 0) return state;
  const usable = new Map<CardId, CardId>();
  for (const [handle, card] of known) {
    if (veilHandleIndex(handle) === null || isVeilHandle(card)) continue;
    if (stateContainsCardId(state, handle)) usable.set(handle, card);
  }
  return substituteCardIds(state, usable);
}

/**
 * The same resolution, for the fx timeline that narrates a move.
 *
 * `resolveVeiledState` puts real faces on the table; without this the flights
 * that carry cards there still name handles. The card element in the DOM is
 * keyed by its resolved id, the cue names `v#12`, nothing matches, and no
 * flight is planned — so the card does not travel, it simply appears where it
 * landed. Reported as cards "jumping to the finished location", most often on a
 * discard, and seen by BOTH peers at once, which is what separates it from a
 * dropped frame: the fx payload was wrong for everybody, not late for one.
 *
 * Unlike the state resolution this does not require the handle to still be on
 * the table. A played card has already left the hand it flew out of, and that
 * flight is exactly the one worth drawing.
 */
export function resolveVeiledFx<T>(fx: T, known: ReadonlyMap<CardId, CardId>): T {
  if (known.size === 0) return fx;
  const usable = new Map<CardId, CardId>();
  for (const [handle, card] of known) {
    if (veilHandleIndex(handle) === null || isVeilHandle(card)) continue;
    usable.set(handle, card);
  }
  return substituteCardIds(fx, usable);
}

// ---------------------------------------------------------------------------
// Deal order
// ---------------------------------------------------------------------------

/**
 * The deck order `setup` deals from. Open rooms shuffle with the seeded rng as
 * always; veiled rooms receive the ceremony's opaque order, in which the only
 * real card ids are the setup cards the room deliberately opened in public
 * (Blitz's face-up discard, Wildpile's numeric starter).
 */
export function dealOrder(
  ctx: { rng: Rng; deckOrder?: readonly CardId[] },
  deck: DeckDef,
): CardId[] {
  if (!ctx.deckOrder) return shuffledIds(deck, ctx.rng);
  if (ctx.deckOrder.length !== deck.cardIds.length) {
    throw new Error(
      `veiled deck order has ${ctx.deckOrder.length} entries, expected ${deck.cardIds.length}`,
    );
  }
  return [...ctx.deckOrder];
}

/**
 * What a game needs from the ceremony before `setup` can run in a veiled room.
 *
 * The ceremony deals handles for everything private, then opens deck positions
 * from `publicSetupFrom` one at a time until `publicSetupReady` accepts the
 * opened prefix. Blitz needs exactly one card (the starting discard); Wildpile
 * keeps opening until it finds a number card; Rat Screw needs none at all
 * because every pile stays face down until it is flipped.
 */
export interface VeilSupport {
  /**
   * The canonical deck for these rules — also the membership set every reveal
   * proof is checked against. It takes the config because house rules can
   * change what is in the deck (Wildpile's optional swap wilds).
   */
  deck(config: RuleValues): DeckDef;
  /** first deck index that must be opened in public before setup */
  publicSetupFrom(seats: number, config: RuleValues): number;
  /** true when the cards opened from that index onward are enough to deal */
  publicSetupReady(opened: readonly CardId[], seats: number, config: RuleValues): boolean;
  /**
   * The move that deals this game another hand inside the same session, for
   * games whose match spans several deals.
   *
   * A veiled deal is one shuffle ceremony over one deck, so a second hand needs
   * a second ceremony — which is why a veiled match used to stop after one.
   * Naming the move here is what lets the room run that ceremony first and hand
   * the fresh deck to the move, instead of each multi-deal game inventing its
   * own way to say "not while veiled".
   */
  redealMove?: string;

  /**
   * The cards this game is waiting to have opened in public, and the move that
   * consumes them. Null whenever nothing is pending, which is almost always.
   *
   * Polled by the host rather than pushed by the game, for the same reason the
   * redeal is: a pack cannot reach the network, and the room must not have to
   * understand any particular game's idea of a street or a showdown.
   */
  publicOpens?: (state: unknown) => VeilPublicOpen | null;

  /**
   * The cards THIS seat is obliged to show, and the move that shows them.
   *
   * {@link publicOpens} is the table's half: the host runs the peel chain over
   * cards nobody owns — a board, a street. This is the seat's half: cards one
   * player holds that the round cannot finish without seeing, like every hand
   * still face down when Blitz's knock window closes. Only their owner can
   * open them, so the room polls this per seat and each client sends the move
   * with its own openings.
   *
   * An obligation, not a choice — the game should return non-null only when
   * the round is waiting on these cards and nothing else. Anything a player
   * might *decline* to show belongs in the UI, not here.
   */
  selfOpens?: (state: unknown, seat: SeatId) => VeilSelfOpen | null;
}

/** A set of handles the table has to be able to read, and what to do with them. */
export interface VeilPublicOpen {
  /** Handles to run the peel chain over, in public. */
  handles: readonly CardId[];
  /** The move to inject once they are open, carrying the openings as reveals. */
  move: string;
}

/** A seat's own cards the round is waiting on, and the move that shows them. */
export interface VeilSelfOpen {
  /** Handles this seat holds and owes the table. */
  handles: readonly CardId[];
  /** The move this seat sends, carrying the openings as reveals. */
  move: string;
}

/**
 * How a veiled game says "I am ready to deal again, and I need a deck for it".
 *
 * The room cannot read a game's state to know a hand is over — that is the
 * whole point of the pack boundary — so the redeal move reports it through the
 * ordinary validation path instead. Seeing this code, and only this code, is
 * the host's cue to run a shuffle ceremony and inject the move with the deck it
 * produced. Any other rule error means the game is not waiting on one.
 */
export const VEILED_REDEAL_PENDING = 'no-veiled-deck';

/**
 * How a veiled game says "these cards have to be turned face up before I can go on".
 *
 * The redeal code above covers a game that needs a whole new deck. This covers
 * the other half: a game that needs particular cards it is already holding
 * opened to the whole table mid-hand — a hold'em board, or the hole cards of
 * everyone still contesting a pot at showdown.
 *
 * The room cannot read the game's state to know which those are, so the game
 * names them through {@link VeilSupport.publicOpens} and refuses the move that
 * would turn them until they are open. Seeing this code, and only this code, is
 * the host's cue to run the peel chain in public and inject the move with the
 * openings it produced.
 */
export const VEILED_OPEN_PENDING = 'no-veiled-open';

/**
 * The payload a veiled redeal carries: the deck a ceremony just produced.
 *
 * Shared so that every multi-deal game agrees on the shape, and so the deck
 * lands in the event log where replay can find it — a hand dealt from a deck
 * that only the dealer knew would not replay anywhere else.
 */
export interface VeiledDealPayload {
  deckOrder: CardId[];
}

export function isVeiledDealPayload(payload: unknown): payload is VeiledDealPayload {
  if (payload === null || typeof payload !== 'object') return false;
  const order = (payload as { deckOrder?: unknown }).deckOrder;
  return Array.isArray(order) && order.length > 0 && order.every((id) => typeof id === 'string');
}

/** Ceiling on public setup openings, so a malformed game cannot open the deck. */
export const MAX_PUBLIC_SETUP_OPENS = 16;

/**
 * Declarative game-pack config for Veil. A game pack states what its deck is,
 * how many cards each seat is dealt, and which setup cards the room has to turn
 * face up before dealing — everything else (opaque handles, opening a card as
 * it goes public, re-veiling a recycled stock, replay, audit) is inherited from
 * the engine and the transport.
 *
 *   veil: veilSupport({ deck: DECK, handSize: 3, publicSetup: 'one' })
 *
 * Anything that varies with house rules can be a function of the config.
 */
export interface VeilPack {
  /** the deck this game deals from */
  deck: DeckDef | ((config: RuleValues) => DeckDef);
  /**
   * Cards dealt to each seat before the public setup cards (default 0).
   *
   * Takes the seat count as well as the config because a hand size can depend
   * on how many seats are sharing the deck — Oh Hell deals as many as the deck
   * allows, which is a different number at four seats than at seven.
   */
  handSize?: number | ((config: RuleValues, seats: number) => number);
  /**
   * Setup cards the room must open in public before `setup` can deal.
   * `'none'` (default) for games where everything starts face down, `'one'`
   * for a single face-up starter, or a predicate when the game keeps opening
   * until some condition holds (Wildpile needs a number card).
   */
  publicSetup?: 'none' | 'one' | ((opened: readonly CardId[], config: RuleValues) => boolean);
  /** See {@link VeilSupport.redealMove} — the move that deals another hand. */
  redealMove?: string;
  /** See {@link VeilSupport.publicOpens}. */
  publicOpens?: (state: unknown) => VeilPublicOpen | null;
  /** See {@link VeilSupport.selfOpens}. */
  selfOpens?: (state: unknown, seat: SeatId) => VeilSelfOpen | null;
}

function resolveDeck(pack: VeilPack, config: RuleValues): DeckDef {
  return typeof pack.deck === 'function' ? pack.deck(config) : pack.deck;
}

/** Turns a {@link VeilPack} into the {@link VeilSupport} the engine consumes. */
export function veilSupport(pack: VeilPack): VeilSupport {
  const mode = pack.publicSetup ?? 'none';
  return {
    deck: (config) => resolveDeck(pack, config),
    redealMove: pack.redealMove,
    publicOpens: pack.publicOpens,
    selfOpens: pack.selfOpens,
    publicSetupFrom(seats, config) {
      if (mode === 'none') return resolveDeck(pack, config).cardIds.length;
      const size =
        typeof pack.handSize === 'function' ? pack.handSize(config, seats) : (pack.handSize ?? 0);
      return seats * size;
    },
    publicSetupReady(opened, _seats, config) {
      if (mode === 'none') return opened.length === 0;
      if (mode === 'one') return opened.length === 1;
      return mode(opened, config);
    },
  };
}

/**
 * Builds the deck order handed to `setup`: handles everywhere, with the
 * publicly opened setup cards substituted in at their real positions.
 */
export function veiledDeckOrder(
  support: VeilSupport,
  seats: number,
  opened: readonly CardId[],
  config: RuleValues = {},
): CardId[] {
  const size = support.deck(config).cardIds.length;
  const from = support.publicSetupFrom(seats, config);
  if (!Number.isInteger(from) || from < 0 || from + opened.length > size) {
    throw new Error('veiled setup opening falls outside the deck');
  }
  if (!support.publicSetupReady(opened, seats, config)) {
    throw new Error('veiled setup needs more public openings');
  }
  const order = veilHandles(size);
  opened.forEach((card, offset) => {
    order[from + offset] = card;
  });
  return order;
}
