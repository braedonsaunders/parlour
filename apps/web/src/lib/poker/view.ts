import type { GameSession, LegalMove } from '@parlour/engine';
import {
  bigBlindSeat,
  blindsForLevel,
  anteForLevel,
  handLabel,
  minRaiseTo,
  rankHand,
  smallBlindSeat,
  toCall,
  type HandSummary,
  type PokerRules,
  type PokerState,
  type Street,
} from '@parlour/game-poker';
import type { PokerModeId } from '@/lib/poker/modes';

export interface PokerSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  stack: number;
  /** chips in front of this seat on the current street */
  bet: number;
  folded: boolean;
  allIn: boolean;
  /** busted out of the match */
  out: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  /** two cards for the local seat or a shown hand, otherwise face-down count */
  hole: readonly string[];
  holeFaceUp: boolean;
  /** "Pair of eights" once a hand is face up at showdown */
  handLabel: string | null;
  /** what this seat last did, for the action bubble */
  lastAction: string | null;
  /** finishing place, once busted */
  place: number | null;
}

/** One quick button under the raise slider. */
export interface RaiseOption {
  to: number;
  label: string;
}

export interface PokerActionView {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  /** 'bet' when nothing is in front yet, 'raise' when answering one */
  raiseVerb: 'bet' | 'raise';
  minRaiseTo: number;
  maxRaiseTo: number;
  /** the engine's ladder, for quick buttons */
  raiseOptions: readonly RaiseOption[];
}

export interface PokerTableView {
  players: readonly PokerSeatView[];
  localSeat: number;
  activeSeat: number | null;
  street: Street;
  streetLabel: string;
  board: readonly string[];
  pot: number;
  currentBet: number;
  handNo: number;
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  button: number;
  /** null when it is not this device's turn */
  action: PokerActionView | null;
  /** the local seat's own two cards */
  hand: readonly string[];
  /** the best five cards the local seat currently holds, for highlighting */
  bestFive: readonly string[];
  handLabel: string | null;
  lastHand: HandSummary | null;
  matchOver: boolean;
  won: boolean | null;
  mode: PokerModeId;
  rules: PokerRules;
}

export interface PokerSnapshot {
  mode: PokerModeId;
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    isBot: boolean;
  }[];
  session: GameSession<PokerState, PokerRules>;
  won: boolean | null;
}

const STREET_LABELS: Readonly<Record<Street, string>> = {
  preflop: 'Before the flop',
  flop: 'The flop',
  turn: 'The turn',
  river: 'The river',
  showdown: 'Showdown',
  'hand-over': 'Hand over',
};

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

function amountOf(move: LegalMove): number {
  const to = payloadOf(move).to;
  return typeof to === 'number' ? to : 0;
}

/**
 * Names a raise size the way a player would say it.
 *
 * The engine hands over a ladder of legal amounts with no opinion about what
 * they mean; this is where "half pot" and "all in" come from, by measuring each
 * one back against the pot it was derived from.
 */
function labelRaise(to: number, state: PokerState, seat: number, isMin: boolean): string {
  const stack = (state.stacks[seat] ?? 0) + (state.streetBet[seat] ?? 0);
  if (to >= stack) return 'All in';
  if (isMin) return 'Min';
  const call = toCall(state, seat);
  const potAfterCall = state.committed.reduce((sum, chips) => sum + chips, 0) + call;
  const over = to - state.currentBet;
  const ratio = potAfterCall > 0 ? over / potAfterCall : 0;
  if (ratio <= 0.6) return 'Half pot';
  if (ratio <= 0.85) return '¾ pot';
  return 'Pot';
}

function describeAction(state: PokerState, seat: number): string | null {
  const mine = [...state.actions].reverse().find((entry) => entry.seat === seat);
  if (!mine) return null;
  // Only this street's action is still news; a call on the flop says nothing
  // about what the seat just did on the river.
  if (mine.street !== state.street) return null;
  switch (mine.kind) {
    case 'fold':
      return 'Fold';
    case 'check':
      return 'Check';
    case 'call':
      return mine.allIn ? 'All in' : `Call ${mine.amount}`;
    case 'bet':
      return mine.allIn ? 'All in' : `Bet ${mine.to}`;
    case 'raise':
      return mine.allIn ? 'All in' : `Raise to ${mine.to}`;
    case 'blind':
      return `Blind ${mine.amount}`;
    case 'ante':
      return `Ante ${mine.amount}`;
  }
}

/**
 * Pure snapshot → render model for the poker table. `legal` must be the moves
 * offered to the viewing seat; pass [] while others act.
 */
export function pokerTableView(
  snapshot: PokerSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): PokerTableView {
  const session = snapshot.session;
  const state = session.state;
  const playing = session.status === 'playing';
  const isLocalTurn = playing && state.turn === localSeat;
  const offered = isLocalTurn ? legal : [];

  const blinds = blindsForLevel(state.level);
  const smallSeat = smallBlindSeat(state);
  const bigSeat = bigBlindSeat(state);

  const players: PokerSeatView[] = snapshot.players.map((player) => {
    const seat = player.seat;
    const faceUp = seat === localSeat || state.shown[seat] === true;
    const hole = state.hole[seat] ?? [];
    const readable = faceUp && hole.every((card) => card !== '??');
    return {
      seat,
      name: player.name,
      avatarId: player.avatarId,
      isLocal: seat === localSeat,
      isBot: player.isBot,
      stack: state.stacks[seat] ?? 0,
      bet: state.streetBet[seat] ?? 0,
      folded: state.folded[seat] === true,
      allIn: state.allIn[seat] === true,
      out: state.out[seat] === true,
      isButton: seat === state.button,
      isSmallBlind: seat === smallSeat,
      isBigBlind: seat === bigSeat,
      isTurn: state.turn === seat,
      hole: readable ? hole : hole.map(() => '??'),
      holeFaceUp: readable,
      handLabel: readable && state.board.length >= 3 ? handLabel([...hole, ...state.board]) : null,
      lastAction: describeAction(state, seat),
      place: state.out[seat] ? state.seats - state.bustOrder.indexOf(seat) : null,
    };
  });

  const raiseMoves = offered.filter((move) => move.id === 'bet' || move.id === 'raise');
  const callMove = offered.find((move) => move.id === 'call');
  const floor = raiseMoves.length > 0 ? minRaiseTo(state) : 0;

  const action: PokerActionView | null = isLocalTurn
    ? {
        canFold: offered.some((move) => move.id === 'fold'),
        canCheck: offered.some((move) => move.id === 'check'),
        canCall: callMove !== undefined,
        callAmount: toCall(state, localSeat),
        canRaise: raiseMoves.length > 0,
        raiseVerb: state.currentBet === 0 ? 'bet' : 'raise',
        minRaiseTo: Math.min(
          ...raiseMoves.map(amountOf).filter((amount) => amount > 0),
          Number.POSITIVE_INFINITY,
        ),
        maxRaiseTo: Math.max(0, ...raiseMoves.map(amountOf)),
        raiseOptions: raiseMoves.map((move) => ({
          to: amountOf(move),
          label: labelRaise(amountOf(move), state, localSeat, amountOf(move) === floor),
        })),
      }
    : null;

  const own = state.hole[localSeat] ?? [];
  const readableOwn = own.filter((card) => card !== '??');
  const showdownReady = readableOwn.length === 2 && state.board.length >= 3;

  const pot = state.committed.reduce((sum, chips) => sum + chips, 0);

  return {
    players,
    localSeat,
    activeSeat: playing ? state.turn : null,
    street: state.street,
    streetLabel: STREET_LABELS[state.street],
    board: [...state.board],
    // `committed` already carries this street's bets, so this is the whole
    // middle — no separate "pot plus bets" figure to keep in step.
    pot,
    currentBet: state.currentBet,
    handNo: state.handNo,
    level: state.level,
    smallBlind: blinds.small,
    bigBlind: blinds.big,
    ante: anteForLevel(state.level, state.rules),
    button: state.button,
    action,
    hand: readableOwn,
    bestFive: showdownReady ? [...rankHand([...readableOwn, ...state.board]).cards] : [],
    handLabel: showdownReady ? handLabel([...readableOwn, ...state.board]) : null,
    lastHand: state.lastHand,
    matchOver: session.status !== 'playing',
    won: snapshot.won,
    mode: snapshot.mode,
    rules: state.rules,
  };
}
