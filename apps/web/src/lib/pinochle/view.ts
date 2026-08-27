import type { GameSession, LegalMove } from '@parlour/engine';
import {
  TRICKS_PER_HAND,
  type HandSummary,
  type MeldBreakdown,
  type PinochleRules,
  type PinochleState,
  type PinochleSuit,
} from '@parlour/game-pinochle';
import { getPinochleMode, type PinochleModeId } from '@/lib/pinochle/modes';

export interface PinochlePlayerView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  team: 0 | 1;
  handCount: number;
  isDealer: boolean;
  /** this seat's most recent bid this auction, or null if it has not acted (or passed) */
  lastBid: number | null;
  /** true once this seat has passed out of the current auction */
  hasPassed: boolean;
  /** true while this seat is still eligible to bid or pass this auction */
  isInAuction: boolean;
  /** this seat's confirmed meld breakdown, once melding has started */
  meld: MeldBreakdown | null;
  hasConfirmedMeld: boolean;
}

export interface TeamScoreView {
  team: 0 | 1;
  score: number;
  /** true when this partnership won the auction and named trump this hand */
  isBidTeam: boolean;
  tricks: number;
  trickPoints: number;
  meld: number;
  label: string;
}

export interface PinochleTrickPlayView {
  seat: number;
  card: string;
}

export type PinochleDecision = 'bid' | 'name-trump' | 'confirm-meld' | 'play' | null;

export interface PinochleTableView {
  players: readonly PinochlePlayerView[];
  localSeat: number;
  activeSeat: number | null;
  stageLabel: string;
  scores: readonly [number, number];
  targetScore: number;
  teams: [TeamScoreView, TeamScoreView];
  handNo: number;
  dealer: number;
  turn: number | null;

  // bidding
  bids: readonly { seat: number; bid: number | null }[];
  highBid: number | null;
  highBidder: number | null;
  minBid: number;
  maxBid: number;
  activeBidders: readonly number[];

  // trump
  trump: PinochleSuit | null;

  // melding
  melds: readonly (MeldBreakdown | null)[];
  meldConfirmed: readonly boolean[];
  localMeld: MeldBreakdown | null;

  // trick play
  trick: readonly PinochleTrickPlayView[];
  ledSuit: string | null;
  leader: number | null;
  tricksPlayed: number;
  totalTricks: number;
  lastTrickWinner: number | null;
  tricksBySeat: readonly [number, number, number, number];
  trickPointsBySeat: readonly [number, number, number, number];

  hand: readonly string[];
  legalCards: readonly string[];

  decision: PinochleDecision;
  canPass: boolean;
  /** bid amounts currently offered to the local seat, low to high */
  bidOptions: readonly number[];
  /** trump suits currently offered to the local seat (the auction winner) */
  trumpOptions: readonly PinochleSuit[];

  summary: HandSummary | null;
  lastHand: HandSummary | null;

  matchOver: boolean;
  mode: PinochleModeId;
  rules: PinochleRules;
}

export interface PinochleSnapshot {
  mode: PinochleModeId;
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    isBot: boolean;
  }[];
  session: GameSession<PinochleState, PinochleRules>;
  matchWinnerTeam: 0 | 1 | null;
}

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/** This seat's most recent auction action (bid or pass), or null before it has acted. */
function lastBidOf(
  state: PinochleState,
  seat: number,
): { seat: number; bid: number | null } | null {
  for (let i = state.bids.length - 1; i >= 0; i--) {
    const entry = state.bids[i];
    if (entry && entry.seat === seat) return entry;
  }
  return null;
}

function tricksByTeam(state: PinochleState, team: 0 | 1): number {
  return team === 0
    ? state.tricksBySeat[0] + state.tricksBySeat[2]
    : state.tricksBySeat[1] + state.tricksBySeat[3];
}

function trickPointsByTeam(state: PinochleState, team: 0 | 1): number {
  return team === 0
    ? state.trickPointsBySeat[0] + state.trickPointsBySeat[2]
    : state.trickPointsBySeat[1] + state.trickPointsBySeat[3];
}

function meldByTeam(state: PinochleState, team: 0 | 1): number {
  return team === 0
    ? (state.melds[0]?.total ?? 0) + (state.melds[2]?.total ?? 0)
    : (state.melds[1]?.total ?? 0) + (state.melds[3]?.total ?? 0);
}

/**
 * Pure snapshot → render model for the pinochle table. `legal` must be the
 * moves offered to the viewing seat; pass [] while others act, or pass the
 * seat's real legal moves regardless — this function re-derives whether the
 * seat is actually the one acting and drops `legal` itself if not.
 *
 * Melding is the one stage where "whose turn" is not the whole story: every
 * seat confirms its own meld independently of `state.turn` (see
 * `legalMovesForSeat` in the pack's rules, gated on `!meldConfirmed[seat]`), so
 * the local-turn check below asks meld confirmation directly during that
 * stage instead of comparing against `state.turn`. `PinochleTransport` and the
 * engine's `legalMovesFor` compute the seat's actual legal moves the same way.
 */
export function pinochleTableView(
  snapshot: PinochleSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): PinochleTableView {
  const state = snapshot.session.state;
  const isLocalActing =
    state.stage === 'melding'
      ? !state.meldConfirmed[localSeat]
      : state.stage !== 'hand-over' && state.stage !== 'redeal' && state.turn === localSeat;
  const offered = isLocalActing ? legal : [];

  const bidMoves = offered.filter((move) => move.id === 'bid');
  const passMoves = offered.filter((move) => move.id === 'pass');
  const trumpMoves = offered.filter((move) => move.id === 'nameTrump');
  const confirmMoves = offered.filter((move) => move.id === 'confirmMeld');
  const playMoves = offered.filter((move) => move.id === 'playCard');

  const decision: PinochleDecision =
    playMoves.length > 0
      ? 'play'
      : confirmMoves.length > 0
        ? 'confirm-meld'
        : trumpMoves.length > 0
          ? 'name-trump'
          : bidMoves.length > 0 || passMoves.length > 0
            ? 'bid'
            : null;

  const bidOptions = bidMoves.map((move) => payloadOf(move).bid as number).sort((a, b) => a - b);
  const trumpOptions = [...new Set(trumpMoves.map((move) => payloadOf(move).suit as PinochleSuit))];
  const legalCards = playMoves.map((move) => payloadOf(move).card as string);

  const players: PinochlePlayerView[] = snapshot.players.map((player) => {
    const lastBid = lastBidOf(state, player.seat);
    return {
      ...player,
      isLocal: player.seat === localSeat,
      team: (player.seat % 2) as 0 | 1,
      handCount: state.hands[player.seat]?.length ?? 0,
      isDealer: player.seat === state.dealer,
      lastBid: lastBid?.bid ?? null,
      hasPassed: lastBid !== null && lastBid.bid === null,
      isInAuction: state.activeBidders.includes(player.seat),
      meld: state.melds[player.seat] ?? null,
      hasConfirmedMeld: state.meldConfirmed[player.seat] ?? false,
    };
  });

  const teams: [TeamScoreView, TeamScoreView] = [
    {
      team: 0,
      score: state.scores[0],
      isBidTeam: state.highBidder !== null && state.highBidder % 2 === 0,
      tricks: tricksByTeam(state, 0),
      trickPoints: trickPointsByTeam(state, 0),
      meld: meldByTeam(state, 0),
      label: 'North–South',
    },
    {
      team: 1,
      score: state.scores[1],
      isBidTeam: state.highBidder !== null && state.highBidder % 2 === 1,
      tricks: tricksByTeam(state, 1),
      trickPoints: trickPointsByTeam(state, 1),
      meld: meldByTeam(state, 1),
      label: 'East–West',
    },
  ];

  const stageLabel = buildStageLabel(snapshot.mode, state);
  const trick = state.trick?.plays ?? [];

  return {
    localSeat,
    players,
    activeSeat: state.stage === 'hand-over' || state.stage === 'redeal' ? null : state.turn,
    stageLabel,
    scores: [state.scores[0], state.scores[1]],
    targetScore: state.rules.target,
    teams,
    handNo: state.handNo,
    dealer: state.dealer,
    turn: state.stage === 'hand-over' || state.stage === 'redeal' ? null : state.turn,

    bids: state.bids,
    highBid: state.highBid,
    highBidder: state.highBidder,
    minBid: state.rules.minBid,
    maxBid: 60,
    activeBidders: state.activeBidders,

    trump: state.trump,

    melds: state.melds,
    meldConfirmed: state.meldConfirmed,
    localMeld: state.melds[localSeat] ?? null,

    trick,
    ledSuit: state.trick?.ledSuit ?? null,
    leader: state.leader,
    tricksPlayed: state.tricksPlayed,
    totalTricks: TRICKS_PER_HAND,
    lastTrickWinner: state.trickWinners.at(-1) ?? null,
    tricksBySeat: state.tricksBySeat,
    trickPointsBySeat: state.trickPointsBySeat,

    hand: state.hands[localSeat] ?? [],
    legalCards,

    decision,
    canPass: passMoves.length > 0,
    bidOptions,
    trumpOptions,

    summary: state.summary,
    lastHand: state.lastHand,

    matchOver: snapshot.matchWinnerTeam !== null,
    mode: snapshot.mode,
    rules: state.rules,
  };
}

const SUIT_NAMES: Record<PinochleSuit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};

export function pinochleSuitName(suit: PinochleSuit): string {
  return SUIT_NAMES[suit];
}

function buildStageLabel(mode: PinochleModeId, state: PinochleState): string {
  const preset = getPinochleMode(mode).name.toLowerCase();
  switch (state.stage) {
    case 'bidding':
      return `${preset} · bidding`;
    case 'naming-trump':
      return `${preset} · naming trump`;
    case 'melding':
      return `${preset} · melding`;
    case 'playing':
      return `${preset} · trick ${state.tricksPlayed + 1} of ${TRICKS_PER_HAND}`;
    case 'hand-over':
      return `${preset} · hand over`;
    case 'redeal':
      return `${preset} · redeal`;
  }
}
