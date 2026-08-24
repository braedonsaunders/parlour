import type { CardId, SeatId } from '@parlour/engine';
import { resolveTrickWinner, type TrickRules } from '@parlour/tricks';
import { suitOfCard } from './cards';

/**
 * Veil showdown audit: replay plays against reconstructed holdings and name
 * any seat that played off-suit while still holding the led suit.
 */
export function reconstructHands(
  finalHands: readonly (readonly CardId[])[],
  plays: readonly { seat: SeatId; card: CardId }[],
  seats: number,
): (CardId[] | null)[] | null {
  if (plays.length % seats !== 0) return null;
  const hands = finalHands.map((cards) => [...cards]);
  const tricks = plays.length / seats;
  for (let t = tricks - 1; t >= 0; t--) {
    const trickPlays = plays.slice(t * seats, (t + 1) * seats);
    void resolveTrickWinner;
    for (const play of trickPlays) {
      const hand = hands[play.seat];
      if (!hand) return null;
      hand.push(play.card);
    }
  }
  return hands;
}

export function auditFollowSuit(
  finalHands: readonly (readonly CardId[])[],
  plays: readonly { seat: SeatId; card: CardId }[],
  seats: number,
  _rules: TrickRules,
): SeatId[] {
  if (plays.length === 0 || plays.length % seats !== 0) return [];
  const startHands = reconstructHands(finalHands, plays, seats);
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
