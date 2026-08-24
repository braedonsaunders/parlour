import type { LegalMove } from '@parlour/engine';
import type { EuchreRules, EuchreSuit } from '@parlour/game-euchre';
import { getEuchreMode, type EuchreModeId } from '@/lib/euchre/modes';
import type { GameSession } from '@parlour/engine';

export interface EuchrePlayerView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  team: 0 | 1;
  handCount: number;
  isDealer: boolean;
  isSittingOut: boolean;
}

export interface TeamScoreView {
  team: 0 | 1;
  score: number;
  /** true when this partnership called trump for the current hand */
  isMaker: boolean;
  tricks: number;
  label: string;
}

export type EuchreDecision = 'order-up' | 'call-trump' | 'dealer-discard' | 'play' | null;

export interface EuchreTableView {
  players: readonly EuchrePlayerView[];
  localSeat: number;
  activeSeat: number | null;
  stageLabel: string;
  scores: readonly [number, number];
  targetScore: number;
  teams: [TeamScoreView, TeamScoreView];
  handNo: number;
  dealer: number;
  turn: number | null;
  biddingRound: 1 | 2 | null;
  upcard: string | null;
  turnedDown: string | null;
  trump: EuchreSuit | null;
  caller: number | null;
  alone: boolean;
  sittingOut: number | null;
  trick: readonly { seat: number; card: string }[];
  leader: number | null;
  tricksPlayed: number;
  lastTrickWinner: number | null;
  hand: readonly string[];
  legalCards: readonly string[];
  callSuits: readonly EuchreSuit[];
  canPass: boolean;
  decision: EuchreDecision;
  matchOver: boolean;
  mode: EuchreModeId;
  rules: EuchreRules;
}

export interface EuchreSnapshot {
  mode: EuchreModeId;
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    isBot: boolean;
  }[];
  session: GameSession<EuchreStateLike, EuchreRules>;
  matchWinnerTeam: 0 | 1 | null;
}

/** Structural subset the view model needs from @parlour/game-euchre's state. */
export interface EuchreStateLike {
  rules: EuchreRules;
  scores: readonly [number, number];
  handNo: number;
  dealer: number;
  hands: readonly (readonly string[])[];
  kitty: readonly string[];
  upcard: string | null;
  turnedDown: string | null;
  stage: 'bidding' | 'discarding' | 'playing' | 'hand-over';
  biddingRound: 1 | 2;
  turn: number;
  passesThisRound: number;
  trump: EuchreSuit | null;
  caller: number | null;
  alone: boolean;
  sittingOut: number | null;
  leader: number | null;
  trick: readonly { seat: number; card: string }[];
  tricksPlayed: number;
  trickWinners: readonly number[];
  summary: unknown;
}

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/**
 * Pure snapshot → render model for the euchre table. `legal` must be the moves
 * offered to the viewing seat; pass [] while others act.
 */
export function euchreTableView(
  snapshot: EuchreSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): EuchreTableView {
  const state = snapshot.session.state;
  const isLocalTurn = snapshot.session.status === 'playing' && state.turn === localSeat;
  const offered = isLocalTurn ? legal : [];

  const callMoves = offered.filter((move) => move.id === 'callTrump');
  const orderMoves = offered.filter((move) => move.id === 'orderUp');
  const discardMoves = offered.filter((move) => move.id === 'dealerDiscard');
  const playMoves = offered.filter((move) => move.id === 'playCard');
  const canPass = offered.some((move) => move.id === 'bidPass');

  const decision: EuchreDecision =
    playMoves.length > 0
      ? 'play'
      : discardMoves.length > 0
        ? 'dealer-discard'
        : orderMoves.length > 0
          ? 'order-up'
          : callMoves.length > 0
            ? 'call-trump'
            : null;

  const legalCards = playMoves.map((move) => payloadOf(move).card as string);
  const callSuits = [...new Set(callMoves.map((move) => payloadOf(move).suit as EuchreSuit))];

  const makerTeam: 0 | 1 | null = state.caller === null ? null : ((state.caller % 2) as 0 | 1);
  const tricksBy = (team: 0 | 1): number =>
    state.trickWinners.filter((seat) => seat % 2 === team).length;

  const teamLabels: [string, string] = ['Us & Them', ''];
  void teamLabels;

  const teams: [TeamScoreView, TeamScoreView] = [
    {
      team: 0,
      score: state.scores[0],
      isMaker: makerTeam === 0,
      tricks: tricksBy(0),
      label: 'North–South',
    },
    {
      team: 1,
      score: state.scores[1],
      isMaker: makerTeam === 1,
      tricks: tricksBy(1),
      label: 'East–West',
    },
  ];

  const stageLabel = buildStageLabel(snapshot.mode, state);

  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      ...player,
      isLocal: player.seat === localSeat,
      team: (player.seat % 2) as 0 | 1,
      handCount: state.hands[player.seat]?.length ?? 0,
      isDealer: player.seat === state.dealer,
      isSittingOut: player.seat === state.sittingOut,
    })),
    activeSeat: snapshot.session.status === 'playing' ? state.turn : null,
    stageLabel,
    scores: [state.scores[0], state.scores[1]],
    targetScore: state.rules.targetScore,
    teams,
    handNo: state.handNo,
    dealer: state.dealer,
    turn: state.stage === 'hand-over' ? null : state.turn,
    biddingRound: state.stage === 'bidding' ? state.biddingRound : null,
    upcard: state.upcard,
    turnedDown: state.turnedDown,
    trump: state.trump,
    caller: state.caller,
    alone: state.alone,
    sittingOut: state.sittingOut,
    trick: state.trick,
    leader: state.leader,
    tricksPlayed: state.tricksPlayed,
    lastTrickWinner: state.trickWinners.at(-1) ?? null,
    hand: state.hands[localSeat] ?? [],
    legalCards,
    callSuits,
    canPass,
    decision,
    matchOver: snapshot.matchWinnerTeam !== null,
    mode: snapshot.mode,
    rules: state.rules,
  };
}

const SUIT_NAMES: Record<EuchreSuit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

export function suitName(suit: EuchreSuit): string {
  return SUIT_NAMES[suit];
}

function buildStageLabel(mode: EuchreModeId, state: EuchreStateLike): string {
  const preset = getEuchreMode(mode).name.toLowerCase();
  switch (state.stage) {
    case 'bidding':
      return state.biddingRound === 1 ? `${preset} · order it up` : `${preset} · name trump`;
    case 'discarding':
      return `${preset} · dealer buries`;
    case 'playing':
      return `${preset} · trick ${state.tricksPlayed + 1} of 5`;
    case 'hand-over':
      return `${preset} · hand over`;
  }
}
