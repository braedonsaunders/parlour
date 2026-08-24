import type { LegalMove } from '@parlour/engine';
import type { HeartsState } from '@parlour/game-hearts';
import type { HeartsModeId } from '@/lib/hearts/modes';

export interface HeartsSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  /** cumulative match score */
  score: number;
  /** cards captured this hand */
  takenCount: number;
  isLocal: boolean;
  isBot: boolean;
}

export interface TrickCardView {
  card: string;
  seat: number;
}

export type HeartsDecision = 'pass' | 'play' | null;

export interface HeartsTableView {
  mode: HeartsModeId;
  players: readonly HeartsSeatView[];
  localSeat: number;
  activeSeat: number | null;
  phaseLabel: string;
  handNumber: number;
  /** cards currently on the table, in play order */
  trick: readonly TrickCardView[];
  ledSuit: string | null;
  heartsBroken: boolean;
  jackDiamonds: boolean;
  passDirection: string | null;
  /** seats still to pick in the pass phase */
  awaitingPass: readonly number[];
  hand: readonly string[];
  decision: HeartsDecision;
  playableCards: readonly string[];
  /** this hand's running points per seat (from captured piles) */
  handPoints: readonly number[];
}

/**
 * Pure match-session → render model. `legal` must be the moves offered to the
 * local seat right now; empty while bots act.
 */
export function heartsTableView(input: {
  mode: HeartsModeId;
  localSeat: number;
  players: readonly { seat: number; name: string; avatarId: string; isBot: boolean }[];
  scores: readonly number[];
  state: HeartsState;
  legal: readonly LegalMove[];
}): HeartsTableView {
  const { state, legal, localSeat, players, scores, mode } = input;
  const isPassPhase = state.passing;
  const isMyTurn = !state.handOver && !isPassPhase && state.turn === localSeat;
  const offered = isMyTurn ? legal : [];

  const trick = (state.trick?.plays ?? []).map((play) => ({ card: play.card, seat: play.seat }));

  const handPoints = computeHandPoints(state);

  return {
    mode,
    localSeat,
    players: players.map((player) => ({
      ...player,
      handCount: state.hands[player.seat]?.length ?? 0,
      score: scores[player.seat] ?? 0,
      takenCount: state.taken[player.seat]?.length ?? 0,
      isLocal: player.seat === localSeat,
    })),
    activeSeat: state.handOver ? null : isPassPhase ? null : state.turn,
    phaseLabel: heartsPhaseLabel(mode, state),
    handNumber: state.tricksPlayed >= 13 ? 13 : state.tricksPlayed + 1,
    trick,
    ledSuit: state.trick?.ledSuit ?? null,
    heartsBroken: state.heartsBroken,
    jackDiamonds: state.rules.jackDiamonds,
    passDirection: isPassPhase ? state.rules.passDirection : null,
    awaitingPass: isPassPhase
      ? state.selections.flatMap((picked, seat) => (picked === null ? [seat] : []))
      : [],
    hand: state.hands[localSeat] ?? [],
    decision:
      state.handOver || (!isPassPhase && !isMyTurn)
        ? null
        : isPassPhase && state.selections[localSeat] === null
          ? 'pass'
          : isMyTurn
            ? 'play'
            : null,
    playableCards: offered.flatMap((move) =>
      move.id === 'playCard' &&
      typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
        ? [(move.payload as { card: string }).card]
        : [],
    ),
    handPoints,
  };
}

const MODE_NAMES: Record<HeartsModeId, string> = {
  classic: 'classic',
  quickcut: 'quick cut',
  cutthroat: 'cutthroat',
};

export function computeHandPoints(state: HeartsState): number[] {
  return state.taken.map((pile) =>
    pile.reduce((sum, card) => {
      if (card.startsWith('H')) return sum + 1;
      if (card === 'S12') return sum + 13;
      if (state.rules.jackDiamonds && card === 'D11') return sum - 10;
      return sum;
    }, 0),
  );
}

function heartsPhaseLabel(mode: HeartsModeId, state: HeartsState): string {
  const name = MODE_NAMES[mode] ?? 'hearts';
  if (state.handOver) return `${name} · hand scored`;
  if (state.passing) {
    const direction = state.rules.passDirection;
    return `${name} · passing ${direction}`;
  }
  if (!state.ledTwoClubs) return `${name} · two of clubs leads`;
  return `${name} · trick ${Math.min(13, state.tricksPlayed + 1)} of 13`;
}
