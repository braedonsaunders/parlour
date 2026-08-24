import type { CardId, SeatId } from '@parlour/engine';
import { resolveTrickWinner, type TrickRules } from '@parlour/tricks';
import { suitOfCard } from './cards';

/**
 * Veil showdown audit.
 *
 * Under Veil the table cannot see a hand while it plays, so follow-suit is
 * honor-based at the table and audited once every remaining hand is opened at
 * the end. This module replays the hand's plays against reconstructed
 * holdings — built backwards from the revealed final hands — and names any
 * seat that played off-suit while holding the led suit.
 *
 * It checks ONLY what the open table would have enforced: follow-suit. House
 * exceptions the open game validates against hidden state (all-hearts lead,
 * all-penalty first trick) are claim-gated at play time instead, so they are
 * already proven before they enter the log.
 */

export function reconstructHands(
  finalHands: readonly (readonly CardId[])[],
  plays: readonly { seat: SeatId; card: CardId }[],
  seats: number,
  trickRules: TrickRules,
): (CardId[] | null)[] | null {
  if (plays.length % seats !== 0) return null;
  const hands = finalHands.map((cards) => [...cards]);
  const tricks = plays.length / seats;
  for (let t = tricks - 1; t >= 0; t--) {
    const trickPlays = plays.slice(t * seats, (t + 1) * seats);
    const winner = resolveTrickWinner(
      { leader: trickPlays[0]!.seat, plays: trickPlays, ledSuit: null },
      trickRules,
    );
    for (const play of trickPlays) {
      const hand = hands[play.seat];
      if (!hand) return null;
      hand.push(play.card);
    }
    void winner;
  }
  return hands;
}

/** Seats that broke follow-suit with the led suit still in hand. */
export function auditFollowSuit(
  finalHands: readonly (readonly CardId[])[],
  plays: readonly { seat: SeatId; card: CardId }[],
  seats: number,
  trickRules: TrickRules,
): SeatId[] {
  if (plays.length === 0 || plays.length % seats !== 0) return [];
  const startHands = reconstructHands(finalHands, plays, seats, trickRules);
  if (!startHands) return [];

  const working = startHands.map((cards) => [...(cards ?? [])]);
  const disputed = new Set<SeatId>();
  for (let index = 0; index < plays.length; index++) {
    const play = plays[index]!;
    const trickStart = index - (index % seats);
    const ledSuit = suitOfCard(plays[trickStart]!.card);
    const hand = working[play.seat] ?? [];
    const at = hand.indexOf(play.card);
    if (at >= 0) hand.splice(at, 1);
    if (
      ledSuit !== null &&
      suitOfCard(play.card) !== ledSuit &&
      hand.some((card) => suitOfCard(card) === ledSuit)
    ) {
      disputed.add(play.seat);
    }
  }
  return [...disputed].sort((a, b) => a - b);
}
