import type { LegalMove } from '@parlour/engine';
import { STOCK_DEAL, type SpiderHint, type SpiderPlayerView } from '@parlour/game-spider';
import type { SpiderSnapshot } from '@/lib/solo/SpiderTransport';

export type SpiderZone = 'stock' | `tableau:${number}` | `foundation:${number}`;

export interface SpiderSelection {
  from: `tableau:${number}`;
  card: string;
  count: number;
}

export interface SpiderTableView {
  mode: SpiderSnapshot['mode'];
  dailyKey: string | null;
  stage: SpiderPlayerView['stage'];
  suitCount: 1 | 2 | 4;
  moves: number;
  stockCount: number;
  stockDeals: number;
  foundations: readonly (readonly string[])[];
  tableau: SpiderPlayerView['tableau'];
  legal: readonly LegalMove[];
  canUndo: boolean;
  undoDepth: number;
  canFinish: boolean;
  hint: SpiderHint | null;
}

export function spiderTableView(
  snapshot: SpiderSnapshot,
  legal: readonly LegalMove[],
): SpiderTableView {
  const state = snapshot.session.state;
  return {
    mode: snapshot.mode,
    dailyKey: snapshot.dailyKey,
    stage: state.stage,
    suitCount: state.rules.suitCount,
    moves: state.moves,
    stockCount: state.stock.length,
    stockDeals: Math.floor(state.stock.length / STOCK_DEAL),
    foundations: state.foundations,
    tableau: state.tableau,
    legal,
    canUndo: snapshot.canUndo,
    undoDepth: snapshot.undoDepth,
    canFinish: snapshot.canFinish,
    hint: snapshot.hint,
  };
}

export function selectionForCard(
  view: SpiderTableView,
  from: SpiderSelection['from'],
  card: string,
): SpiderSelection | null {
  const sourceMoves = view.legal.filter((move) => sourceOfMove(move) === from);
  const column = Number(from.split(':')[1]);
  const up = view.tableau[column]?.up ?? [];
  const index = up.indexOf(card);
  if (index < 0) return null;
  const selection = { from, card, count: up.length - index } satisfies SpiderSelection;
  return sourceMoves.some((move) => cardOfMove(move, view) === card) ? selection : null;
}

export function moveForTarget(
  view: SpiderTableView,
  selection: SpiderSelection,
  target: SpiderZone,
): LegalMove | null {
  return (
    view.legal.find(
      (move) =>
        sourceOfMove(move) === selection.from &&
        cardOfMove(move, view) === selection.card &&
        targetOfMove(move) === target,
    ) ?? null
  );
}

export function targetsForSelection(
  view: SpiderTableView,
  selection: SpiderSelection | null,
): SpiderZone[] {
  if (!selection) return [];
  return view.legal
    .filter(
      (move) => sourceOfMove(move) === selection.from && cardOfMove(move, view) === selection.card,
    )
    .map((move) => targetOfMove(move))
    .filter((zone): zone is SpiderZone => zone !== null);
}

export function sourceOfMove(move: LegalMove): SpiderZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.deal':
      return 'stock';
    case 'tableau.move': {
      const from = numberField(payload, 'from');
      return from === null ? null : `tableau:${from}`;
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove): SpiderZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.deal':
      return 'stock';
    case 'tableau.move': {
      const to = numberField(payload, 'to');
      return to === null ? null : `tableau:${to}`;
    }
    default:
      return null;
  }
}

export function cardOfMove(move: LegalMove, _view: SpiderTableView): string | null {
  const payload = recordPayload(move);
  return move.id === 'tableau.move' && typeof payload.card === 'string' ? payload.card : null;
}

export function describeHint(hint: SpiderHint | null, _view: SpiderTableView): string | null {
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
