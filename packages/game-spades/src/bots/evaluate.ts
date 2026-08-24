import type { CardId } from '@parlour/engine';
import { isSpade, rankOfCard, suitOfCard } from '../cards';
import type { SpadesState } from '../state';

export function ownHand(state: SpadesState, seat: number): CardId[] {
  return (state.hands[seat] ?? []).filter((card) => card !== '??');
}

export function expectedTricks(hand: readonly CardId[]): number {
  let books = 0;
  const bySuit = new Map<string, CardId[]>();
  for (const card of hand) {
    const suit = suitOfCard(card);
    if (!suit) continue;
    const pile = bySuit.get(suit) ?? [];
    pile.push(card);
    bySuit.set(suit, pile);
  }
  for (const [suit, cards] of bySuit) {
    const sorted = [...cards].sort((a, b) => rankOfCard(b) - rankOfCard(a));
    const ace = sorted.some((card) => rankOfCard(card) === 14);
    const king = sorted.some((card) => rankOfCard(card) === 13);
    if (ace) books += 1;
    if (king && (ace || cards.length >= 3)) books += 1;
    if (suit === 'spades') {
      books += Math.max(0, cards.length - 3) * 0.6;
      for (const card of cards) {
        if (rankOfCard(card) >= 11 && rankOfCard(card) < 13) books += 0.5;
      }
    }
  }
  return books;
}

export function highCardPoints(hand: readonly CardId[]): number {
  return hand.reduce((sum, card) => {
    const rank = rankOfCard(card);
    if (rank === 14) return sum + 4;
    if (rank === 13) return sum + 3;
    if (rank === 12) return sum + 2;
    if (rank === 11) return sum + 1;
    return sum;
  }, 0);
}

export function spadeCount(hand: readonly CardId[]): number {
  return hand.filter(isSpade).length;
}

export function currentWinner(
  state: SpadesState,
): { seat: number; rank: number; trump: boolean } | null {
  const trick = state.trick;
  if (!trick || trick.plays.length === 0) return null;
  const led = trick.ledSuit;
  let winner = trick.plays[0]!;
  let winningRank = rankOfCard(winner.card);
  let winningTrump = isSpade(winner.card);
  for (const play of trick.plays.slice(1)) {
    const trump = isSpade(play.card);
    const rank = rankOfCard(play.card);
    const sameLed = suitOfCard(play.card) === led;
    if (trump && !winningTrump) {
      winner = play;
      winningRank = rank;
      winningTrump = true;
    } else if (trump === winningTrump && (trump || sameLed) && rank > winningRank) {
      winner = play;
      winningRank = rank;
    }
  }
  return { seat: winner.seat, rank: winningRank, trump: winningTrump };
}

export function partnerIsWinning(state: SpadesState, seat: number): boolean {
  const winner = currentWinner(state);
  return winner !== null && winner.seat === (seat + 2) % 4;
}
