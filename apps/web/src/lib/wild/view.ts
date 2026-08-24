import type { LegalMove } from '@parlour/engine';
import type { WildpileColor } from '@parlour/game-wildpile';
import { getWildMode, type WildModeId } from '@/lib/wild/modes';
import type { WildSnapshot } from '@/lib/solo/WildTransport';

export type WildDecision = 'play' | 'choose-color' | 'jump-in';

export interface WildSeatView {
  seat: number;
  name: string;
  avatarId: string;
  handCount: number;
  isLocal: boolean;
  isBot: boolean;
}

export interface WildTableView {
  players: readonly WildSeatView[];
  localSeat: number;
  activeSeat: number | null;
  stockCount: number;
  /** Top-first, capped for the pile display. */
  discard: readonly string[];
  activeColor: WildpileColor | null;
  direction: 1 | -1;
  pendingDraw: number;
  phaseLabel: string;
  hand: readonly string[];
  /** The local seat's pending decision, or null while others act. */
  decision: WildDecision | null;
  legal: {
    playCards: readonly string[];
    draw: boolean;
    declineJump: boolean;
    chooseColor: boolean;
  };
}

function payloadCard(move: LegalMove): string | null {
  const card = (move.payload as { card?: unknown } | undefined)?.card;
  return typeof card === 'string' ? card : null;
}

function localDecision(phase: string): WildDecision {
  if (phase === 'choose-color') return 'choose-color';
  if (phase === 'interrupt') return 'jump-in';
  return 'play';
}

/**
 * Pure snapshot → render model for the Wild table. `legal` must be the moves
 * the transport currently offers seat 0; while bots act it should be empty.
 */
export function wildTableView(
  snapshot: WildSnapshot,
  legal: readonly LegalMove[],
  localSeat = 0,
): WildTableView {
  const { session } = snapshot;
  const state = session.state;
  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const offered = isLocalTurn ? legal : [];
  const playCards = offered.flatMap((move) =>
    move.id === 'playCard' && payloadCard(move) ? [payloadCard(move)!] : [],
  );
  return {
    localSeat,
    players: snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      handCount: state.hands[player.seat]?.length ?? 0,
      isLocal: player.seat === localSeat,
      isBot: player.isBot,
    })),
    activeSeat: session.phase.actor,
    stockCount: state.stock.length,
    discard: state.discard.slice(0, 3),
    activeColor: state.activeColor,
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    phaseLabel: wildPhaseLabel(snapshot.mode, state.pendingDraw),
    hand: state.hands[localSeat] ?? [],
    decision: isLocalTurn ? localDecision(session.phase.phase) : null,
    legal: {
      playCards,
      draw: offered.some((move) => move.id === 'draw'),
      declineJump: offered.some((move) => move.id === 'declineJump'),
      chooseColor: offered.some((move) => move.id === 'chooseColor'),
    },
  };
}

function wildPhaseLabel(mode: WildModeId, pendingDraw: number): string {
  const name = getWildMode(mode).name.toLowerCase();
  return pendingDraw > 0 ? `${name} pile · +${pendingDraw} brewing` : `${name} pile · one deal`;
}
