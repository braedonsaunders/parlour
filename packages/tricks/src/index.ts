import {
  seatOrder,
  type CardFace,
  type CardId,
  type FxEmitter,
  type SeatId,
} from '@parlour/engine';

/**
 * @parlour/tricks — neutral trick-taking primitives.
 *
 * Shared by Hearts, Spades, Euchre, Oh Hell, Whist … and hard-coded to none of
 * them. A trick is an ordered zone of plays; legality (follow suit) and winner
 * resolution (led suit vs trump) are pure functions over caller-supplied card
 * facts, so any deck definition works. Games layer their own restrictions
 * (point-card bans, must-lead rules) on top; nothing here knows about points.

 * Play order is clockwise by seat (`trickOrder`), matching every current
 * parlour table layout.
 */

export interface TrickPlay {
  seat: SeatId;
  card: CardId;
}

export interface Trick {
  leader: SeatId;
  plays: TrickPlay[];
  /** Suit of the first card played; null while the trick is empty. */
  ledSuit: string | null;
}

/** Card facts a game supplies so this package stays deck-agnostic. */
export interface TrickRules {
  suitOf(card: CardId): string | null;
  rankOf(card: CardId): number;
  /**
   * Suit the card counts as for winning purposes. Defaults to `suitOf`; Euchre
   * style left-bower remaps hook in here without touching call sites.
   * `null` means "not a real card" and can never win a trick, matching
   * `suitOf`'s contract.
   */
  effectiveSuit?(card: CardId): string | null;
  /** Trump suit for winner resolution; null/undefined means no trump. */
  trumpSuit?: string | null;
}

/** Canonical fx kinds emitted through the passed emitter. UI-only vocabulary. */
export const TrickFx = {
  /** {seat, card, index} — one per card landing on the table */
  Play: 'tricks.play',
  /** {seat: winner, cards, count} — the completed trick sweeping to its taker */
  Collect: 'tricks.collect',
} as const;

export function openTrick(leader: SeatId): Trick {
  return { leader, plays: [], ledSuit: null };
}

/** Seats in play order starting from `leader`, clockwise. */
export function trickOrder(leader: SeatId, seats: number): SeatId[] {
  return seatOrder(leader, seats);
}

export function trickPlaysNeeded(seats: number): number {
  return Math.max(1, seats);
}

export function isTrickComplete(trick: Trick, seats: number): boolean {
  return trick.plays.length >= trickPlaysNeeded(seats);
}

export function trickCards(trick: Trick): CardId[] {
  return trick.plays.map((play) => play.card);
}

/** Adds a play; sets ledSuit from the first card. Pure. */
export function playToTrick(trick: Trick, seat: SeatId, card: CardId, rules: TrickRules): Trick {
  const plays = [...trick.plays, { seat, card }];
  return {
    ...trick,
    plays,
    // Effective, not printed: leading the left bower leads TRUMP.
    ledSuit: trick.ledSuit ?? effectiveSuitOf(card, rules),
  };
}

/**
 * Suit a card counts as. Games with bower-style remaps supply `effectiveSuit`;
 * everyone else falls through to `suitOf`, so this is a no-op for them.
 */
function effectiveSuitOf(card: CardId, rules: TrickRules): string | null {
  return rules.effectiveSuit ? rules.effectiveSuit(card) : rules.suitOf(card);
}

/**
 * Follow-suit and winner resolution both read the EFFECTIVE suit. They must:
 * in Euchre the left bower follows trump, not its printed suit, so a hand
 * holding only the left bower is not void in trump. Using `suitOf` here would
 * let that hand renege — the remap hook exists precisely to prevent it.
 */
export function hasSuit(cards: readonly CardId[], rules: TrickRules, suit: string): boolean {
  return cards.some((card) => effectiveSuitOf(card, rules) === suit);
}

export interface FollowContext {
  ledSuit: string;
  hand: readonly CardId[];
  card: CardId;
}

/**
 * Follow-suit verdict: `null` when the play is legal, otherwise why not.
 * Void hands may play anything — suit-specific bans belong to games.
 */
export function followError(ctx: FollowContext, rules: TrickRules): string | null {
  if (effectiveSuitOf(ctx.card, rules) === ctx.ledSuit) return null;
  return hasSuit(ctx.hand, rules, ctx.ledSuit) ? 'must-follow-suit' : null;
}

/** Cards in hand that satisfy follow-suit for a led suit (whole hand when void). */
export function legalFollows(
  hand: readonly CardId[],
  ledSuit: string,
  rules: TrickRules,
): CardId[] {
  if (!hasSuit(hand, rules, ledSuit)) return [...hand];
  return hand.filter((card) => effectiveSuitOf(card, rules) === ledSuit);
}

/**
 * Winner of a COMPLETE trick: highest trump wins; otherwise the highest card
 * of the led suit. Returns null only for an empty trick.
 */
export function resolveTrickWinner(trick: Trick, rules: TrickRules): SeatId | null {
  const trump = rules.trumpSuit ?? null;
  let winner: SeatId | null = null;
  let winningSuit: string | null = null;
  let winningRank = -Infinity;

  for (const play of trick.plays) {
    const suit = effectiveSuitOf(play.card, rules);
    if (suit === null) continue;
    const rank = rules.rankOf(play.card);
    const beatsTrump = trump !== null && suit === trump && winningSuit !== trump;
    const beatsLed = winningSuit !== null && suit === winningSuit && rank > winningRank;
    const firstCard = winningSuit === null;
    if (!(firstCard || beatsTrump || beatsLed)) continue;
    winner = play.seat;
    winningSuit = suit;
    winningRank = rank;
  }
  return winner;
}

// ---------------------------------------------------------------------------
// Fx hooks — games emit these through their own emitters at apply time
// ---------------------------------------------------------------------------

export function emitTrickPlay(fx: FxEmitter, seat: SeatId, card: CardId, index: number): void {
  fx.emit(TrickFx.Play, { seat, card, index });
}

export function emitTrickCollect(fx: FxEmitter, seat: SeatId, cards: readonly CardId[]): void {
  fx.emit(TrickFx.Collect, { seat, cards: [...cards], count: cards.length });
}

/** Convenience adapter over engine CardFace records. */
export function faceRules(faces: Readonly<Record<CardId, CardFace>>): TrickRules {
  return {
    suitOf: (card) => faces[card]?.suit ?? null,
    rankOf: (card) => {
      const rank = faces[card]?.rank;
      return typeof rank === 'number' ? rank : -1;
    },
  };
}
