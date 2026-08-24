import type { LegalMove } from '@parlour/engine';
import {
  SUITS,
  allowedBids,
  isJester,
  isWizard,
  suitOfCard,
  type OhHellRules,
  type OhHellStage,
  type OhHellState,
  type RoundSummary,
} from '@parlour/game-ohhell';
import type { OhHellMatchSession } from '@/lib/solo/OhHellTransport';
import type { OhHellModeId } from '@/lib/ohhell/modes';

export interface OhHellSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  handCount: number;
  isDealer: boolean;
  isTurn: boolean;
  /** null until this seat has bid */
  bid: number | null;
  tricksWon: number;
  /** cumulative match score, across every completed round */
  score: number;
  /** bid met exactly — the only outcome that scores the bonus */
  onTrack: boolean;
}

export type OhHellDecision = 'trump' | 'bid' | 'play' | null;

export interface OhHellTableView {
  players: readonly OhHellSeatView[];
  localSeat: number;
  activeSeat: number | null;
  stage: OhHellStage;
  stageLabel: string;
  /** 1-based round counter */
  roundNo: number;
  totalRounds: number;
  handSize: number;
  dealer: number;
  trumpCard: string | null;
  trumpSuit: string | null;
  /** cards on the table this trick, in play order */
  trick: readonly { seat: number; card: string }[];
  leader: number | null;
  tricksPlayed: number;
  hand: readonly string[];
  legalCards: readonly string[];
  /** bids the rules will accept from this seat right now */
  bidOptions: readonly number[];
  /** the hook: the one bid the dealer may not make, or null */
  forbiddenBid: number | null;
  /** suits offered when a turned Wizard puts the choice to the dealer */
  trumpOptions: readonly string[];
  decision: OhHellDecision;
  lastRound: RoundSummary | null;
  matchOver: boolean;
  won: boolean | null;
  mode: OhHellModeId;
  rules: OhHellRules;
}

export interface OhHellSnapshot {
  mode: OhHellModeId;
  players: readonly { seat: number; name: string; avatarId: string; isBot: boolean }[];
  match: OhHellMatchSession;
}

const STAGE_LABELS: Readonly<Record<OhHellStage, string>> = {
  trumping: 'Naming trump',
  bidding: 'Bidding',
  playing: 'Playing',
  over: 'Round over',
};

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/** A Wizard beats everything and a Jester loses to everything, suit or no suit. */
export function cardBadge(card: string): 'wizard' | 'jester' | null {
  if (isWizard(card)) return 'wizard';
  if (isJester(card)) return 'jester';
  return null;
}

export const SUIT_GLYPHS: Readonly<Record<string, string>> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

/**
 * Pure snapshot → render model for the Oh Hell table. `legal` must be the moves
 * offered to the viewing seat; pass [] while others act.
 */
export function ohhellTableView(
  snapshot: OhHellSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): OhHellTableView {
  const match = snapshot.match;
  const state = match.round.state as OhHellState;
  const playing = match.status === 'playing';
  const isLocalTurn = playing && state.turn === localSeat && state.stage !== 'over';
  const offered = isLocalTurn ? legal : [];

  const bidMoves = offered.filter((move) => move.id === 'bid');
  const playMoves = offered.filter((move) => move.id === 'playCard');
  const trumpMoves = offered.filter((move) => move.id === 'chooseTrump');

  const decision: OhHellDecision =
    trumpMoves.length > 0
      ? 'trump'
      : bidMoves.length > 0
        ? 'bid'
        : playMoves.length > 0
          ? 'play'
          : null;

  const scores = match.match.scores;
  const schedule = match.match.schedule;

  const players: OhHellSeatView[] = snapshot.players.map((player) => {
    const seat = player.seat;
    const bid = state.bids[seat] ?? null;
    const won = state.tricksWon[seat] ?? 0;
    return {
      seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: seat === localSeat,
      isBot: player.isBot,
      handCount: (state.hands[seat] ?? []).length,
      isDealer: seat === state.dealer,
      isTurn: playing && state.turn === seat && state.stage !== 'over',
      bid,
      tricksWon: won,
      score: scores[seat] ?? 0,
      onTrack: bid !== null && won === bid,
    };
  });

  const ownHand = (state.hands[localSeat] ?? []).filter((card) => card !== '??');

  return {
    players,
    localSeat,
    activeSeat: playing && state.stage !== 'over' ? state.turn : null,
    stage: state.stage,
    stageLabel: STAGE_LABELS[state.stage],
    roundNo: match.roundIndex + 1,
    totalRounds: schedule.length,
    handSize: state.handSize,
    dealer: state.dealer,
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    trick: (state.trick?.plays ?? []).map((play) => ({ seat: play.seat, card: play.card })),
    leader: state.leader,
    tricksPlayed: state.tricksPlayed,
    hand: ownHand,
    legalCards: playMoves
      .map((move) => payloadOf(move).card)
      .filter((card): card is string => typeof card === 'string'),
    bidOptions: bidMoves
      .map((move) => payloadOf(move).bid)
      .filter((bid): bid is number => typeof bid === 'number')
      .sort((left, right) => left - right),
    // Shown even when it is not this seat's decision, so the table can explain
    // why the dealer's rail has a gap in it.
    forbiddenBid: hookFor(state),
    trumpOptions:
      trumpMoves.length > 0
        ? trumpMoves
            .map((move) => payloadOf(move).suit)
            .filter((suit): suit is string => typeof suit === 'string')
        : [],
    decision,
    lastRound: state.summary,
    matchOver: match.status === 'ended',
    won: match.result === null ? null : match.result.winner === localSeat,
    mode: snapshot.mode,
    rules: state.rules,
  };
}

/** The dealer's banned bid under the hook rule, or null when it does not bite. */
function hookFor(state: OhHellState): number | null {
  const bids = allowedBids(state, state.dealer);
  for (let value = 0; value <= state.handSize; value += 1) {
    if (!bids.includes(value)) return value;
  }
  return null;
}

export { SUITS, suitOfCard };
