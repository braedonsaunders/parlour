import type { LegalMove } from '@parlour/engine';
import {
  captureValue,
  isSettebello,
  orderScopaHand,
  ownerOf,
  playsInTeams,
  suitOfCard,
} from '@parlour/game-scopa';
import { getScopaMode, type ScopaModeId } from '@/lib/scopa/modes';
import type { ScopaSnapshot } from '@/lib/solo/ScopaTransport';

/**
 * Everything the Scopa table draws, derived once.
 *
 * The decision this view exists for is the *sum capture*: when your card
 * matches several combinations of table cards, choosing which one to take is a
 * real move, not a detail. Every combination is a distinct legal move in the
 * pack, so the table offers them as distinct choices rather than auto-picking.
 */

export interface ScopaCardView {
  card: string;
  label: string;
  suit: string;
  value: number;
  /** Coins are worth a point as a suit; the seven of coins is worth its own. */
  denari: boolean;
  settebello: boolean;
}

export interface ScopaSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  isTurn: boolean;
  isDealer: boolean;
  handCount: number;
  /** Cards this seat has captured; public in Scopa, everyone saw them taken. */
  captured: number;
  scope: number;
  /** Team id at four and six seats, the seat itself otherwise. */
  owner: number;
  score: number;
}

/** One way to play the held card: which table cards it would take. */
export interface ScopaPlayOption {
  move: LegalMove;
  take: readonly string[];
  /** A pose leaves the card on the table and takes nothing. */
  pose: boolean;
  /** Clearing the table is a scopa, and worth calling out before you commit. */
  scopa: boolean;
}

export interface ScopaTableView {
  mode: ScopaModeId;
  modeName: string;
  localSeat: number;
  seats: readonly ScopaSeatView[];
  /** Face-up cards waiting to be captured or swept. */
  table: readonly ScopaCardView[];
  hand: readonly ScopaCardView[];
  stockCount: number;
  roundNo: number;
  target: number;
  teams: boolean;
  isLocalTurn: boolean;
  /** Cards the local seat may play right now. */
  playable: readonly string[];
  status: 'playing' | 'ended';
  stageLabel: string;
}

function cardView(card: string): ScopaCardView {
  const value = captureValue(card);
  return {
    card,
    label: String(value),
    suit: suitOfCard(card),
    value,
    denari: suitOfCard(card) === 'denari',
    settebello: isSettebello(card),
  };
}

export function scopaTableView(
  snapshot: ScopaSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): ScopaTableView {
  const state = snapshot.session.state;
  const mode = getScopaMode(snapshot.mode);
  const teams = playsInTeams(state.seats);
  const isLocalTurn = snapshot.session.status === 'playing' && state.turn === localSeat;

  const seats: ScopaSeatView[] = snapshot.players.map((player) => {
    const owner = ownerOf(player.seat, state.seats);
    return {
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: player.seat === localSeat,
      isBot: player.isBot,
      isTurn: state.turn === player.seat,
      isDealer: state.dealer === player.seat,
      handCount: state.hands[player.seat]?.length ?? 0,
      captured: state.captures[player.seat]?.length ?? 0,
      scope: state.scope[player.seat] ?? 0,
      owner,
      score: state.scores[owner] ?? 0,
    };
  });

  const playable = isLocalTurn
    ? [
        ...new Set(
          legal.flatMap((move) => {
            const card = (move.payload as { card?: unknown } | undefined)?.card;
            return typeof card === 'string' ? [card] : [];
          }),
        ),
      ]
    : [];

  return {
    mode: snapshot.mode,
    modeName: mode.name,
    localSeat,
    seats,
    table: state.table.map(cardView),
    hand: orderScopaHand(state.hands[localSeat] ?? [], {}).map(cardView),
    stockCount: state.stock.length,
    roundNo: state.roundNo,
    target: state.rules.target,
    teams,
    isLocalTurn,
    playable,
    status: snapshot.session.status === 'ended' ? 'ended' : 'playing',
    stageLabel:
      snapshot.session.status === 'ended'
        ? 'match over'
        : `round ${state.roundNo} · first to ${state.rules.target}`,
  };
}

/**
 * Every way the held card can be played, richest capture first.
 *
 * A single-card match is forced by the rules, so when one exists the pack emits
 * only that; otherwise the list is every sum combination plus the pose. Sorting
 * by how much it takes puts the consequential choice at the front without
 * hiding the modest one.
 */
export function playOptionsFor(
  legal: readonly LegalMove[],
  card: string | null,
  tableSize: number,
): readonly ScopaPlayOption[] {
  if (card === null) return [];
  const options: ScopaPlayOption[] = [];
  for (const move of legal) {
    const payload = move.payload as { card?: unknown; take?: unknown } | undefined;
    if (payload?.card !== card) continue;
    const take = Array.isArray(payload.take) ? (payload.take as string[]) : [];
    options.push({
      move,
      take,
      pose: take.length === 0,
      // Taking every card on the table clears the felt: that is the scopa.
      scopa: take.length > 0 && take.length === tableSize,
    });
  }
  return options.sort((left, right) => right.take.length - left.take.length);
}
