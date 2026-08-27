import type { LegalMove } from '@parlour/engine';
import {
  isFree,
  leftoverOf,
  type TripeaksHint,
  type TripeaksPlayerView,
} from '@parlour/game-tripeaks';
import type { TripeaksSnapshot } from '@/lib/solo/TripeaksTransport';

export type TripeaksZone = 'stock' | 'hole' | `tableau:${number}`;

export interface TripeaksTableView {
  mode: TripeaksSnapshot['mode'];
  dailyKey: string | null;
  stage: TripeaksPlayerView['stage'];
  wrap: boolean;
  recycle: boolean;
  moves: number;
  recycles: number;
  leftover: number;
  stockCount: number;
  hole: readonly string[];
  tableau: readonly (string | null)[];
  legal: readonly LegalMove[];
  canUndo: boolean;
  undoDepth: number;
  hint: TripeaksHint | null;
}

export function tripeaksTableView(
  snapshot: TripeaksSnapshot,
  legal: readonly LegalMove[],
): TripeaksTableView {
  const state = snapshot.session.state;
  return {
    mode: snapshot.mode,
    dailyKey: snapshot.dailyKey,
    stage: state.stage,
    wrap: state.rules.wrap,
    recycle: state.rules.recycle,
    moves: state.moves,
    recycles: state.recycles,
    leftover: leftoverOf(state),
    stockCount: state.stock.length,
    hole: state.hole,
    tableau: state.tableau,
    legal,
    canUndo: snapshot.canUndo,
    undoDepth: snapshot.undoDepth,
    hint: snapshot.hint,
  };
}

export function zoneOfIndex(index: number): TripeaksZone {
  return `tableau:${index}`;
}

export function sourceOfMove(move: LegalMove): TripeaksZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.flip':
      return 'stock';
    case 'stock.recycle':
      return 'hole';
    case 'tableau.play': {
      const from = numberField(payload, 'from');
      return from === null ? null : zoneOfIndex(from);
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove): TripeaksZone | null {
  switch (move.id) {
    case 'stock.flip':
    case 'tableau.play':
      return 'hole';
    case 'stock.recycle':
      return 'stock';
    default:
      return null;
  }
}

export function cardOfMove(move: LegalMove, view: TripeaksTableView): string | null {
  if (move.id !== 'tableau.play') return null;
  const from = numberField(recordPayload(move), 'from');
  return from === null ? null : (view.tableau[from] ?? null);
}

export function describeHint(hint: TripeaksHint | null, view: TripeaksTableView): string | null {
  if (!hint) return null;
  const from = sourceOfMove(hint.move);
  const card = cardOfMove(hint.move, view);
  return [hint.reason, card && `${card}:`, from, '→ hole'].filter(Boolean).join(' ');
}

/** A tap on a playable tableau card dispatches immediately; there is no pairing step. */
export function clickTableau(view: TripeaksTableView, index: number): LegalMove | null {
  return (
    view.legal.find((move) => {
      if (move.id !== 'tableau.play') return false;
      return numberField(recordPayload(move), 'from') === index;
    }) ?? null
  );
}

export function playableIndices(view: TripeaksTableView): readonly number[] {
  return view.legal.flatMap((move) => {
    if (move.id !== 'tableau.play') return [];
    const from = numberField(recordPayload(move), 'from');
    return from === null ? [] : [from];
  });
}

/** Free tableau slots, whether or not they currently play onto the hole. */
export function freeIndices(view: TripeaksTableView): readonly number[] {
  const indices: number[] = [];
  for (let index = 0; index < view.tableau.length; index++) {
    if (isFree(view.tableau, index)) indices.push(index);
  }
  return indices;
}

function recordPayload(move: LegalMove): Record<string, unknown> {
  return typeof move.payload === 'object' && move.payload !== null
    ? (move.payload as Record<string, unknown>)
    : {};
}

function numberField(payload: Record<string, unknown>, key: string): number | null {
  return typeof payload[key] === 'number' ? payload[key] : null;
}
