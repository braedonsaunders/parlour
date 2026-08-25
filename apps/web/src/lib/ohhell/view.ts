import type { LegalMove } from '@parlour/engine';
import { allowedBids, forbiddenBid, orderOhHellHand, SUITS } from '@parlour/game-ohhell';
import type { OhHellState } from '@parlour/game-ohhell';
import { getOhHellMode, type OhHellModeId } from '@/lib/ohhell/modes';
import type { OhHellSnapshot } from '@/lib/solo/OhHellTransport';

/**
 * Everything the Oh Hell table draws, derived once.
 *
 * The screen reads only from here, so the same builder serves a solo match and
 * a friend room and neither can drift from the other's idea of the board.
 */

export interface OhHellSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  isDealer: boolean;
  handCount: number;
  /** null until this seat has bid */
  bid: number | null;
  tricksWon: number;
  /** cumulative match score */
  score: number;
  /**
   * How this seat stands against its bid *right now* — the single most useful
   * number in the game and the reason a bid is worth showing at all.
   */
  standing: 'exact' | 'under' | 'over' | 'unbid';
}

export type OhHellDecision = 'bid' | 'play' | 'trump' | null;

export interface OhHellTrickCardView {
  seat: number;
  card: string;
  isLocal: boolean;
}

export interface OhHellTableView {
  mode: OhHellModeId;
  modeName: string;
  localSeat: number;
  seats: readonly OhHellSeatView[];
  stage: OhHellState['stage'];
  stageLabel: string;
  activeSeat: number | null;
  /** 1-based round, and how many the match will deal */
  round: number;
  rounds: number;
  handSize: number;
  dealer: number;
  /** The card turned for trump; null on a whole-deck no-trump round. */
  trumpCard: string | null;
  trumpSuit: string | null;
  trumpLabel: string;
  /** The local seat's hand, in presentation order. */
  hand: readonly string[];
  /** Cards on the table this trick, in play order. */
  trick: readonly OhHellTrickCardView[];
  ledSuit: string | null;
  tricksPlayed: number;
  decision: OhHellDecision;
  /** Bid values the local seat may name; empty unless it is their bid. */
  bidOptions: readonly number[];
  /** The value the hook rule denies the dealer, when it applies to this seat. */
  forbiddenBid: number | null;
  /** Cards the local seat may legally play right now. */
  playable: readonly string[];
  /** Trump suits offered when a turned Wizard hands the dealer the choice. */
  trumpChoices: readonly string[];
  /** Total bid against tricks available — the hook rule made visible. */
  bidTotal: number;
  roundOver: boolean;
  matchOver: boolean;
}

function standingOf(bid: number | null, won: number): OhHellSeatView['standing'] {
  if (bid === null) return 'unbid';
  if (won === bid) return 'exact';
  return won < bid ? 'under' : 'over';
}

function stageLabelOf(view: {
  stage: OhHellState['stage'];
  round: number;
  rounds: number;
  handSize: number;
  trumpLabel: string;
}): string {
  const where = `round ${view.round}/${view.rounds} · ${view.handSize} card${
    view.handSize === 1 ? '' : 's'
  }`;
  if (view.stage === 'trumping') return `${where} · dealer names trump`;
  if (view.stage === 'bidding') return `${where} · bidding · ${view.trumpLabel}`;
  if (view.stage === 'over') return `${where} · round complete`;
  return `${where} · ${view.trumpLabel}`;
}

function payloadNumber(move: LegalMove, key: string): number | null {
  const value = (move.payload as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' ? value : null;
}

function payloadString(move: LegalMove, key: string): string | null {
  const value = (move.payload as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : null;
}

export function ohhellTableView(
  snapshot: OhHellSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): OhHellTableView {
  const state = snapshot.hand.state;
  const mode = getOhHellMode(snapshot.mode);
  const trumpSuit = state.trumpSuit ?? null;
  const trumpLabel = trumpSuit ? `${trumpSuit} is trump` : 'no trump';

  const seats: OhHellSeatView[] = snapshot.players.map((player) => {
    const bid = state.bids[player.seat] ?? null;
    const tricksWon = state.tricksWon[player.seat] ?? 0;
    return {
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: player.seat === localSeat,
      isBot: player.isBot,
      isDealer: player.seat === state.dealer,
      // Only the local seat's cards are ever known here; everyone else is a
      // count, which is all `playerView` gives the client anyway.
      handCount: state.hands[player.seat]?.length ?? 0,
      bid,
      tricksWon,
      score: snapshot.scores[player.seat] ?? 0,
      standing: standingOf(bid, tricksWon),
    };
  });

  const isLocalTurn = snapshot.status === 'playing' && state.turn === localSeat;
  const decision: OhHellDecision =
    !isLocalTurn || legal.length === 0
      ? null
      : state.stage === 'trumping'
        ? 'trump'
        : state.stage === 'bidding'
          ? 'bid'
          : 'play';

  const bidOptions =
    decision === 'bid'
      ? legal
          .filter((move) => move.id === 'bid')
          .map((move) => payloadNumber(move, 'bid'))
          .filter((bid): bid is number => bid !== null)
          .sort((a, b) => a - b)
      : [];

  const playable =
    decision === 'play'
      ? legal
          .filter((move) => move.id === 'playCard')
          .map((move) => payloadString(move, 'card'))
          .filter((card): card is string => card !== null)
      : [];

  const trumpChoices =
    decision === 'trump'
      ? legal
          .filter((move) => move.id === 'chooseTrump')
          .map((move) => payloadString(move, 'suit'))
          .filter((suit): suit is string => suit !== null)
      : [...SUITS];

  const hand = orderOhHellHand(state.hands[localSeat] ?? [], {
    trumpSuit,
    dealer: state.dealer,
  });

  const view: OhHellTableView = {
    mode: snapshot.mode,
    modeName: mode.name,
    localSeat,
    seats,
    stage: state.stage,
    stageLabel: '',
    activeSeat: snapshot.status === 'playing' ? state.turn : null,
    round: snapshot.round,
    rounds: snapshot.rounds,
    handSize: state.handSize,
    dealer: state.dealer,
    trumpCard: state.trumpCard ?? null,
    trumpSuit,
    trumpLabel,
    hand,
    trick: (state.trick?.plays ?? []).map((play) => ({
      seat: play.seat,
      card: play.card,
      isLocal: play.seat === localSeat,
    })),
    ledSuit: state.trick?.ledSuit ?? null,
    tricksPlayed: state.tricksPlayed,
    decision,
    bidOptions,
    // Only ever shown to the seat the hook actually binds: the dealer, bidding
    // last. Showing it to anyone else would explain a rule that is not
    // constraining them.
    forbiddenBid: decision === 'bid' && localSeat === state.dealer ? forbiddenBid(state) : null,
    playable,
    trumpChoices,
    bidTotal: seats.reduce((total, seat) => total + (seat.bid ?? 0), 0),
    roundOver: snapshot.status === 'round-over' || state.stage === 'over',
    matchOver: snapshot.status === 'ended',
  };
  return { ...view, stageLabel: stageLabelOf(view) };
}

/** Every bid the rules allow this seat, for a table that wants the full dial. */
export function ohhellBidDial(state: OhHellState, seat: number): readonly number[] {
  return allowedBids(state, seat);
}
