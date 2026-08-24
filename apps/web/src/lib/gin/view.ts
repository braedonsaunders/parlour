import type { LegalMove } from '@parlour/engine';
import { bestPartition, type GinMeld } from '@parlour/game-gin';
import type { GinMatchState } from '@parlour/game-gin';

import type { GinSnapshot } from '@/lib/solo/GinTransport';

export interface GinSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  isLocal: boolean;
  isBot: boolean;
  score: number;
  handsWon: number;
  dealer: boolean;
}

export interface GinHandEndView {
  reason: string;
  knocker: number | null;
  scorer: number | null;
  points: number;
  deadwood: readonly [number | null, number | null];
  layoffs: readonly { card: string; meldIndex: number }[];
  meldsBySeat: readonly (readonly GinMeld[])[];
  waitingFor: readonly number[];
}

export interface GinTableView {
  players: readonly GinSeatView[];
  localSeat: number;
  activeSeat: number | null;
  handNumber: number;
  matchTarget: number;
  stockCount: number;
  /** top-first, capped for the pile display */
  discard: readonly string[];
  upcard: string | null;
  phaseLabel: string;
  decision: 'option' | 'draw' | 'act' | 'hand-end' | null;
  hand: readonly string[];
  /** solver preview of the local hand — null while faces are hidden */
  meldPreview: readonly GinMeld[];
  deadwood: number | null;
  knockCap: number;
  canKnock: boolean;
  legal: {
    takeUpcard: boolean;
    passUpcard: boolean;
    drawStock: boolean;
    drawDiscard: boolean;
    discardCards: readonly string[];
  };
  handEnd: GinHandEndView | null;
  matchOver: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  option: 'The upcard',
  turn: 'Your draw',
  act: 'Discard or knock',
  'showdown.reveal': 'Opening hands',
  'hand-end': 'Hand over',
  over: 'Match over',
};

/**
 * Pure snapshot → render model for the Gin table. `legal` must be the moves
 * the transport currently offers the local seat; empty while others act.
 */
export function ginTableView(
  snapshot: GinSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): GinTableView {
  const state: GinMatchState = snapshot.session.state;
  const hand = state.hand;
  const isLocalTurn =
    snapshot.session.status === 'playing' &&
    !state.folded &&
    sessionActor(snapshot.session) === localSeat;
  const offered = isLocalTurn ? legal : [];

  const ids = new Set(offered.map((move) => move.id));
  const discardCards = offered.flatMap((move) =>
    move.id === 'discard' && typeof (move.payload as { card?: unknown })?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );

  const localHand = hand.hands[localSeat] ?? [];
  const hidden = localHand.some((card) => card.startsWith('v#') || card === '?');
  const preview = hidden ? [] : bestPartition(localHand).melds;
  const deadwood = hidden || state.folded ? null : bestPartition(localHand).deadwood;

  const decision = state.folded
    ? 'hand-end'
    : isLocalTurn
      ? hand.optionSeat !== null
        ? ('option' as const)
        : sessionPhase(snapshot.session) === 'turn'
          ? ('draw' as const)
          : ('act' as const)
      : null;

  const lastOutcome = state.lastOutcome;
  const handEnd =
    state.folded && lastOutcome
      ? {
          reason: lastOutcome.reason,
          knocker: lastOutcome.knocker,
          scorer: lastOutcome.scorer,
          points: lastOutcome.points,
          deadwood: [lastOutcome.deadwood[0] ?? null, lastOutcome.deadwood[1] ?? null] as readonly [
            number | null,
            number | null,
          ],
          layoffs: [...lastOutcome.layoffs],
          meldsBySeat: [0, 1].map((seat) =>
            hasFaces(hand.hands[seat]) ? bestPartition(hand.hands[seat] ?? []).melds : [],
          ),
          waitingFor: [0, 1].filter((seat) => !state.readied.includes(seat)),
        }
      : null;

  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      ...player,
      handCount: hand.hands[player.seat]?.length ?? 0,
      isLocal: player.seat === localSeat,
      score: state.scores[player.seat] ?? 0,
      handsWon: state.handsWon[player.seat] ?? 0,
      dealer: hand.dealer === player.seat,
    })),
    activeSeat: snapshot.session.status === 'playing' ? sessionActor(snapshot.session) : null,
    handNumber: state.handIndex + 1,
    matchTarget: state.rules.matchTarget,
    stockCount: hand.stock.length,
    discard: hand.discard.slice(0, 3),
    upcard: hand.discard[0] ?? null,
    phaseLabel: PHASE_LABELS[sessionPhase(snapshot.session)] ?? 'Gin rummy',
    decision,
    hand: localHand,
    meldPreview: preview,
    deadwood,
    knockCap: state.rules.knockCap,
    canKnock: ids.has('knock'),
    legal: {
      takeUpcard: ids.has('option.take'),
      passUpcard: ids.has('option.pass'),
      drawStock: ids.has('draw.stock'),
      drawDiscard: ids.has('draw.discard'),
      discardCards,
    },
    handEnd,
    matchOver: snapshot.session.status === 'ended' || snapshot.matchWinner !== null,
  };
}

function hasFaces(cards: readonly string[] | undefined): boolean {
  return Boolean(cards?.length) && !cards!.some((card) => card.startsWith('v#') || card === '?');
}

type MatchSession = GinSnapshot['session'];

function sessionActor(session: MatchSession): number | null {
  return session.phase.actor;
}

function sessionPhase(session: MatchSession): string {
  if (session.state.folded) return 'hand-end';
  return session.phase.phase;
}
