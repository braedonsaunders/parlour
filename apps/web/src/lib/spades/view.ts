import type { GameSession, LegalMove } from '@parlour/engine';
import {
  teamContract,
  teamNilTricks,
  teamNonNilTricks,
  type HandSummary,
  type SpadesBid,
  type SpadesRules,
  type SpadesState,
} from '@parlour/game-spades';
import { getSpadesMode, type SpadesModeId } from '@/lib/spades/modes';

export interface SpadesPlayerSeatView {
  seat: number;
  name: string;
  avatarId: string;
  isLocal: boolean;
  isBot: boolean;
  team: 0 | 1;
  handCount: number;
  isDealer: boolean;
  /** null until this seat has bid; `nil` is a bid of its own, not a zero. */
  bid: SpadesBid | null;
  tricksWon: number;
}

export interface SpadesTeamView {
  team: 0 | 1;
  score: number;
  bags: number;
  /** Sum of the non-nil bids placed so far — grows during bidding. */
  contract: number;
  /**
   * Tricks that count toward the contract — non-nil seats only. A nil seat's
   * tricks are bags and a broken nil, never progress, so folding them in here
   * would show a set partnership as having made its bid.
   */
  tricks: number;
  /** Tricks taken by this partnership's nil seats; every one of them is a bag. */
  nilTricks: number;
  /** Seats on this team that bid nil, and whether each is still clean. */
  nilSeats: readonly { seat: number; intact: boolean }[];
  label: string;
}

export type SpadesDecision = 'bid' | 'play' | null;

export interface SpadesTableView {
  players: readonly SpadesPlayerSeatView[];
  localSeat: number;
  activeSeat: number | null;
  stageLabel: string;
  stage: SpadesState['stage'];
  scores: readonly [number, number];
  bags: readonly [number, number];
  targetScore: number;
  teams: [SpadesTeamView, SpadesTeamView];
  handNo: number;
  dealer: number;
  turn: number | null;
  trick: readonly { seat: number; card: string }[];
  leader: number | null;
  ledSuit: string | null;
  spadesBroken: boolean;
  /** Both partnerships crossed the target level, so the match plays on. */
  overtime: boolean;
  tricksPlayed: number;
  lastTrickWinner: number | null;
  hand: readonly string[];
  legalCards: readonly string[];
  /** Regular bids the engine is offering this seat, ascending. */
  bidOptions: readonly number[];
  canBidNil: boolean;
  decision: SpadesDecision;
  /** The most recent completed hand, kept through the auto-deal for the sheet. */
  lastHand: HandSummary | null;
  matchOver: boolean;
  mode: SpadesModeId;
  rules: SpadesRules;
}

export interface SpadesSnapshot {
  mode: SpadesModeId;
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    isBot: boolean;
  }[];
  session: GameSession<SpadesState, SpadesRules>;
  matchWinnerTeam: 0 | 1 | null;
}

const TEAM_LABELS: readonly [string, string] = ['You & partner', 'Openers'];

function payloadOf(move: LegalMove): Record<string, unknown> {
  return (move.payload as Record<string, unknown> | undefined) ?? {};
}

/**
 * Pure snapshot → render model for the Spades table. `legal` must be the moves
 * offered to the viewing seat; pass [] while others act.
 */
export function spadesTableView(
  snapshot: SpadesSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): SpadesTableView {
  const state = snapshot.session.state;
  const isLocalTurn = snapshot.session.status === 'playing' && state.turn === localSeat;
  const offered = isLocalTurn ? legal : [];

  const bidMoves = offered.filter((move) => move.id === 'bid');
  const playMoves = offered.filter((move) => move.id === 'playCard');
  const canBidNil = offered.some((move) => move.id === 'bidNil');

  const decision: SpadesDecision =
    playMoves.length > 0 ? 'play' : bidMoves.length > 0 || canBidNil ? 'bid' : null;

  const legalCards = playMoves
    .map((move) => payloadOf(move).card)
    .filter((card): card is string => typeof card === 'string');

  const bidOptions = [
    ...new Set(
      bidMoves
        .map((move) => payloadOf(move).bid)
        .filter((bid): bid is number => typeof bid === 'number'),
    ),
  ].sort((a, b) => a - b);

  // `bidOf` looks up by seat, so the placed subset is a valid partial ledger and
  // the contract reads correctly mid-bidding rather than only once all four are in.
  const placedBids = state.bids.filter((bid): bid is SpadesBid => bid !== null);

  const teams: [SpadesTeamView, SpadesTeamView] = [
    teamView(0, state, placedBids, localSeat),
    teamView(1, state, placedBids, localSeat),
  ];

  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      ...player,
      isLocal: player.seat === localSeat,
      team: (player.seat % 2) as 0 | 1,
      handCount: state.hands[player.seat]?.length ?? 0,
      isDealer: player.seat === state.dealer,
      bid: state.bids[player.seat] ?? null,
      tricksWon: state.tricksBySeat[player.seat] ?? 0,
    })),
    activeSeat: snapshot.session.status === 'playing' ? state.turn : null,
    stageLabel: buildStageLabel(snapshot.mode, state),
    stage: state.stage,
    scores: [state.scores[0], state.scores[1]],
    bags: [state.bags[0], state.bags[1]],
    targetScore: state.rules.targetScore,
    teams,
    handNo: state.handNo,
    dealer: state.dealer,
    turn: state.stage === 'hand-over' ? null : state.turn,
    trick: state.trick?.plays ?? [],
    leader: state.leader,
    ledSuit: state.trick?.ledSuit ?? null,
    spadesBroken: state.spadesBroken,
    overtime: state.overtime,
    tricksPlayed: state.tricksPlayed,
    lastTrickWinner: state.trickWinners.at(-1) ?? null,
    hand: state.hands[localSeat] ?? [],
    legalCards,
    bidOptions,
    canBidNil,
    decision,
    lastHand: state.lastHand ?? state.lastHandSummary,
    matchOver: snapshot.matchWinnerTeam !== null,
    mode: snapshot.mode,
    rules: state.rules,
  };
}

function teamView(
  team: 0 | 1,
  state: SpadesState,
  placedBids: readonly SpadesBid[],
  localSeat: number,
): SpadesTeamView {
  const seats = [0, 1, 2, 3].filter((seat) => seat % 2 === team);
  const nilSeats = seats
    .filter((seat) => state.bids[seat]?.nil === true)
    .map((seat) => ({ seat, intact: (state.tricksBySeat[seat] ?? 0) === 0 }));

  return {
    team,
    score: state.scores[team],
    bags: state.bags[team],
    contract: teamContract(placedBids, team),
    tricks: teamNonNilTricks(placedBids, state.tricksBySeat, team),
    nilTricks: teamNilTricks(placedBids, state.tricksBySeat, team),
    nilSeats,
    // The local player's partnership always reads as "yours", whichever seat they hold.
    label: localSeat % 2 === team ? TEAM_LABELS[0] : TEAM_LABELS[1],
  };
}

function buildStageLabel(mode: SpadesModeId, state: SpadesState): string {
  const preset = getSpadesMode(mode).name.toLowerCase();
  switch (state.stage) {
    case 'bidding': {
      const placed = state.bids.filter((bid) => bid !== null).length;
      return `${preset} · bidding ${placed} of 4`;
    }
    case 'playing':
      return `${preset} · trick ${Math.min(state.tricksPlayed + 1, 13)} of 13`;
    case 'hand-over':
      return state.overtime
        ? `${preset} · level at the target — playing on`
        : `${preset} · hand ${state.handNo} scored`;
  }
}

/** Presentation label for a placed bid — nil is a word, not a number. */
export function bidLabel(bid: SpadesBid | null): string {
  if (bid === null) return '—';
  return bid.nil ? 'nil' : String(bid.tricks);
}

/** The frozen `render_game_to_text` projection of a seat's bid. */
export function bidToken(bid: SpadesBid | null): number | 'nil' | null {
  if (bid === null) return null;
  return bid.nil ? 'nil' : bid.tricks;
}
