import type { CardId, SeatId } from '@parlour/engine';
import type { Trick, TrickPlay } from '@parlour/tricks';
import type { OhHellRules } from './config';

export type OhHellStage = 'trumping' | 'bidding' | 'playing' | 'over';

/**
 * One dealt round of Oh Hell. A round is a complete GameDef session — the
 * match layer (match.ts) owns the cumulative scores and rotates the deal by
 * rewriting `rules.handSize` / `rules.dealer` before each round opens.
 */
export interface OhHellState {
  rules: OhHellRules;
  seats: number;
  stage: OhHellStage;
  /** cards actually dealt to each player this round (the scheduler may shrink rules.handSize) */
  handSize: number;
  dealer: SeatId;
  /** face-down cards left after the deal and the trump flip; never touched again */
  stock: readonly CardId[];
  /** the card turned after the deal; its suit is trump. Null ⇒ no-trump round. */
  trumpCard: CardId | null;
  /** resolved trump suit — differs from the flip when the dealer picks (turned Wizard) */
  trumpSuit: string | null;
  hands: CardId[][];
  bids: readonly (number | null)[];
  /** seat to act (trump choice, bid, or play); null only once the round is over */
  turn: SeatId;
  leader: SeatId | null;
  trick: Trick | null;
  tricksWon: readonly number[];
  tricksPlayed: number;
  /** every card played this round in order — public history the bots mine for voids */
  played: readonly TrickPlay[];
  /** this round's result while `stage === 'over'` */
  summary: RoundSummary | null;
}

export interface RoundSummary {
  handSize: number;
  dealer: SeatId;
  trumpSuit: string | null;
  bids: readonly number[];
  tricksWon: readonly number[];
  points: readonly number[];
}
