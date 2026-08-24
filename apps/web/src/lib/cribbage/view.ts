import type { GameSession, LegalMove } from '@parlour/engine';
import type { CribbageConfig, CribbageState } from '@parlour/game-cribbage';
import type { CribbageModeId } from '@/lib/cribbage/modes';

export interface CribbageSnapshotLike {
  mode: CribbageModeId;
  players: readonly {
    seat: number;
    name: string;
    avatarId: string;
    personaId: string;
    isBot: boolean;
  }[];
  match: {
    status: 'playing' | 'round-over' | 'ended';
    round: GameSession<CribbageState, CribbageConfig>;
    match: { wins: readonly number[]; targetWins: number };
  };
}

export interface CribbageSeatView {
  seat: number;
  name: string;
  avatarId: string;
  personaId: string;
  isLocal: boolean;
  isBot: boolean;
  handCount: number;
  score: number;
  gamesWon: number;
}

export interface CribbageTableView {
  players: readonly CribbageSeatView[];
  localSeat: number;
  activeSeat: number | null;
  dealer: number;
  phase: string;
  phaseLabel: string;
  dealNo: number;
  targetGames: number;
  stockCount: number;
  cribCount: number;
  starter: string | null;
  runningCount: number;
  /** Current pegging sequence, oldest first. */
  pile: readonly string[];
  hand: readonly string[];
  legal: {
    discardPairs: readonly (readonly [string, string])[];
    playCards: readonly string[];
    cut: boolean;
    claim: boolean;
    steal: boolean;
  };
}

function cardsPair(move: LegalMove): readonly [string, string] | null {
  const cards = (move.payload as { cards?: unknown } | undefined)?.cards;
  return Array.isArray(cards) &&
    cards.length === 2 &&
    cards.every((card) => typeof card === 'string')
    ? ([cards[0] as string, cards[1] as string] as const)
    : null;
}

function cardPayload(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

export function cribbageTableView(
  snapshot: CribbageSnapshotLike,
  legal: readonly LegalMove[],
  localSeat = 0,
): CribbageTableView {
  const { match } = snapshot;
  const session = match.round;
  const state = session.state;
  const offered = match.status === 'playing' ? legal : [];
  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      ...player,
      isLocal: player.seat === localSeat,
      handCount: state.hands[player.seat]?.length ?? 0,
      score: state.totals[player.seat] ?? 0,
      gamesWon: match.match.wins[player.seat] ?? 0,
    })),
    activeSeat: session.phase.actor,
    dealer: state.dealer,
    phase: session.phase.phase,
    phaseLabel: session.phase.label ?? session.phase.phase,
    dealNo: state.dealNo,
    targetGames: match.match.targetWins,
    stockCount: state.stock.length,
    cribCount: state.crib.length,
    starter: state.starter,
    runningCount: state.pegging.count,
    pile: state.pegging.pile,
    hand: state.hands[localSeat] ?? [],
    legal: {
      discardPairs: offered.flatMap((move) => {
        const pair = move.id === 'crib.discard' ? cardsPair(move) : null;
        return pair ? [pair] : [];
      }),
      playCards: offered.flatMap((move) => {
        const card = move.id === 'playCard' ? cardPayload(move) : null;
        return card ? [card] : [];
      }),
      cut: offered.some((move) => move.id === 'cut'),
      claim: offered.some((move) => move.id === 'claim'),
      steal: offered.some((move) => move.id === 'steal'),
    },
  };
}
