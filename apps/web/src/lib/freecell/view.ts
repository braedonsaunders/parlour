import type { LegalMove } from '@parlour/engine';
import {
  SUITS,
  suitOfCard,
  type FreecellHint,
  type FreecellPlayerView,
  type FreecellSuit,
} from '@parlour/game-freecell';
import type { FreecellSnapshot } from '@/lib/solo/FreecellTransport';
import { attachDeferredHint } from '@/lib/solo/deferHint';

export type FreecellZone = `cell:${number}` | `tableau:${number}` | `foundation:${FreecellSuit}`;

export interface FreecellSelection {
  from: FreecellZone;
  card: string;
  count: number;
}

export interface FreecellTableView {
  mode: FreecellSnapshot['mode'];
  dailyKey: string | null;
  stage: FreecellPlayerView['stage'];
  freeCells: 4 | 6;
  moves: number;
  cells: readonly (string | null)[];
  foundations: Record<FreecellSuit, readonly string[]>;
  tableau: readonly (readonly string[])[];
  legal: readonly LegalMove[];
  canUndo: boolean;
  undoDepth: number;
  canFinish: boolean;
  hint: FreecellHint | null;
}

export function freecellTableView(
  snapshot: FreecellSnapshot,
  legal: readonly LegalMove[],
): FreecellTableView {
  const state = snapshot.session.state;
  return attachDeferredHint(
    {
      mode: snapshot.mode,
      dailyKey: snapshot.dailyKey,
      stage: state.stage,
      freeCells: state.rules.freeCells,
      moves: state.moves,
      cells: state.cells,
      foundations: state.foundations,
      tableau: state.tableau,
      legal,
      canUndo: snapshot.canUndo,
      undoDepth: snapshot.undoDepth,
      canFinish: snapshot.canFinish,
    },
    // Forwarded lazily: reading this runs the solver, and the table only reads
    // it while a hint is on screen. See FreecellTransport.getSnapshot.
    () => snapshot.hint,
  );
}

export function selectionForCard(
  view: FreecellTableView,
  from: FreecellSelection['from'],
  card: string,
): FreecellSelection | null {
  const sourceMoves = view.legal.filter((move) => sourceOfMove(move, view) === from);
  if (from.startsWith('tableau:')) {
    const column = Number(from.split(':')[1]);
    const up = view.tableau[column] ?? [];
    const index = up.indexOf(card);
    if (index < 0) return null;
    const selection = { from, card, count: up.length - index } satisfies FreecellSelection;
    return sourceMoves.some((move) => cardOfMove(move, view) === card) ? selection : null;
  }
  return sourceMoves.some((move) => cardOfMove(move, view) === card)
    ? { from, card, count: 1 }
    : null;
}

export function moveForTarget(
  view: FreecellTableView,
  selection: FreecellSelection,
  target: FreecellZone,
): LegalMove | null {
  return (
    view.legal.find(
      (move) =>
        sourceOfMove(move, view) === selection.from &&
        cardOfMove(move, view) === selection.card &&
        targetOfMove(move, view) === target,
    ) ?? null
  );
}

export function targetsForSelection(
  view: FreecellTableView,
  selection: FreecellSelection | null,
): FreecellZone[] {
  if (!selection) return [];
  return view.legal
    .filter(
      (move) =>
        sourceOfMove(move, view) === selection.from && cardOfMove(move, view) === selection.card,
    )
    .map((move) => targetOfMove(move, view))
    .filter((zone): zone is FreecellZone => zone !== null);
}

export function sourceOfMove(move: LegalMove, _view: FreecellTableView): FreecellZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'cell.toTableau':
    case 'cell.toFoundation':
    case 'cell.toCell': {
      const from = numberField(payload, 'from');
      return from === null ? null : `cell:${from}`;
    }
    case 'tableau.move':
    case 'tableau.toFoundation':
    case 'tableau.toCell': {
      const from = numberField(payload, 'from');
      return from === null ? null : `tableau:${from}`;
    }
    case 'foundation.toTableau': {
      const suit = payload.suit;
      return typeof suit === 'string' && SUITS.includes(suit as FreecellSuit)
        ? `foundation:${suit as FreecellSuit}`
        : null;
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove, view: FreecellTableView): FreecellZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'tableau.move':
    case 'cell.toTableau':
    case 'foundation.toTableau': {
      const to = numberField(payload, 'to');
      return to === null ? null : `tableau:${to}`;
    }
    case 'cell.toCell':
    case 'tableau.toCell': {
      const to = numberField(payload, 'to');
      return to === null ? null : `cell:${to}`;
    }
    case 'cell.toFoundation': {
      const from = numberField(payload, 'from');
      const card = from === null ? null : view.cells[from];
      const suit = card ? suitOfCard(card) : null;
      return suit ? `foundation:${suit}` : null;
    }
    case 'tableau.toFoundation': {
      const from = numberField(payload, 'from');
      const card = from === null ? null : view.tableau[from]?.at(-1);
      const suit = card ? suitOfCard(card) : null;
      return suit ? `foundation:${suit}` : null;
    }
    default:
      return null;
  }
}

export function cardOfMove(move: LegalMove, view: FreecellTableView): string | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'tableau.move':
      return typeof payload.card === 'string' ? payload.card : null;
    case 'tableau.toFoundation':
    case 'tableau.toCell': {
      const from = numberField(payload, 'from');
      return from === null ? null : (view.tableau[from]?.at(-1) ?? null);
    }
    case 'cell.toTableau':
    case 'cell.toFoundation':
    case 'cell.toCell': {
      const from = numberField(payload, 'from');
      return from === null ? null : (view.cells[from] ?? null);
    }
    case 'foundation.toTableau': {
      const suit = payload.suit;
      return typeof suit === 'string' && SUITS.includes(suit as FreecellSuit)
        ? (view.foundations[suit as FreecellSuit].at(-1) ?? null)
        : null;
    }
    default:
      return null;
  }
}

export function describeHint(hint: FreecellHint | null, _view: FreecellTableView): string | null {
  return hint?.reason ?? null;
}

function recordPayload(move: LegalMove): Record<string, unknown> {
  return typeof move.payload === 'object' && move.payload !== null
    ? (move.payload as Record<string, unknown>)
    : {};
}

function numberField(payload: Record<string, unknown>, key: string): number | null {
  return typeof payload[key] === 'number' ? payload[key] : null;
}
