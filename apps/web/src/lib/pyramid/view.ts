import type { LegalMove } from '@parlour/engine';
import {
  leftoverOf,
  type PyramidHint,
  type PyramidPlayerView,
  type PyramidSource,
} from '@parlour/game-pyramid';
import type { PyramidSnapshot } from '@/lib/solo/PyramidTransport';

export type PyramidZone = 'stock' | 'waste' | `pyramid:${number}:${number}`;

export interface PyramidTableView {
  mode: PyramidSnapshot['mode'];
  dailyKey: string | null;
  stage: PyramidPlayerView['stage'];
  recyclesLimit: 2 | -1;
  moves: number;
  recycles: number;
  leftover: number;
  stockCount: number;
  waste: readonly string[];
  pyramid: readonly (readonly (string | null)[])[];
  legal: readonly LegalMove[];
  canUndo: boolean;
  hint: PyramidHint | null;
}

export type PyramidSelection = PyramidSource;

export function pyramidTableView(
  snapshot: PyramidSnapshot,
  legal: readonly LegalMove[],
): PyramidTableView {
  const state = snapshot.session.state;
  return {
    mode: snapshot.mode,
    dailyKey: snapshot.dailyKey,
    stage: state.stage,
    recyclesLimit: state.rules.recyclesLimit,
    moves: state.moves,
    recycles: state.recycles,
    leftover: leftoverOf(state),
    stockCount: state.stock.length,
    waste: state.waste,
    pyramid: state.pyramid,
    legal,
    canUndo: snapshot.canUndo,
    hint: snapshot.hint,
  };
}

export function zoneOfSource(source: PyramidSource): PyramidZone {
  return source === 'waste' ? 'waste' : `pyramid:${source.row}:${source.col}`;
}

export function sourceOfZone(zone: PyramidZone): PyramidSource | null {
  if (zone === 'waste') return 'waste';
  if (zone === 'stock') return null;
  const match = /^pyramid:(\d+):(\d+)$/.exec(zone);
  return match ? { row: Number(match[1]), col: Number(match[2]) } : null;
}

export function sameSelection(a: PyramidSelection | null, b: PyramidSource): boolean {
  if (!a) return false;
  if (a === 'waste' || b === 'waste') return a === b;
  return a.row === b.row && a.col === b.col;
}

export function clickSource(
  view: PyramidTableView,
  selected: PyramidSelection | null,
  source: PyramidSource,
): { selection: PyramidSelection | null; move: LegalMove | null } {
  const remove = view.legal.find((move) => {
    if (move.id !== 'pyramid.remove') return false;
    return sameSelection(
      (move.payload as { from?: PyramidSource } | undefined)?.from ?? null,
      source,
    );
  });
  if (remove) return { selection: null, move: remove };

  if (sameSelection(selected, source)) return { selection: null, move: null };

  if (selected) {
    const pair = view.legal.find((move) => {
      if (move.id !== 'pyramid.pair') return false;
      const payload = move.payload as { a?: PyramidSource; b?: PyramidSource } | undefined;
      if (!payload?.a || !payload.b) return false;
      return (
        (sameSelection(payload.a, selected) && sameSelection(payload.b, source)) ||
        (sameSelection(payload.b, selected) && sameSelection(payload.a, source))
      );
    });
    if (pair) return { selection: null, move: pair };
  }

  return { selection: source, move: null };
}

export function sourceOfMove(move: LegalMove): PyramidZone | null {
  switch (move.id) {
    case 'stock.draw':
      return 'stock';
    case 'stock.recycle':
      return 'waste';
    case 'pyramid.remove': {
      const from = (move.payload as { from?: PyramidSource } | undefined)?.from;
      return from ? zoneOfSource(from) : null;
    }
    case 'pyramid.pair': {
      const payload = move.payload as { a?: PyramidSource; b?: PyramidSource } | undefined;
      return payload?.a ? zoneOfSource(payload.a) : null;
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove): PyramidZone | null {
  switch (move.id) {
    case 'stock.draw':
      return 'waste';
    case 'stock.recycle':
      return 'stock';
    case 'pyramid.pair': {
      const payload = move.payload as { a?: PyramidSource; b?: PyramidSource } | undefined;
      return payload?.b ? zoneOfSource(payload.b) : null;
    }
    default:
      return null;
  }
}

export function describeHint(hint: PyramidHint | null): string | null {
  return hint?.reason ?? null;
}

export function freeSources(view: PyramidTableView): readonly PyramidSource[] {
  return view.legal.flatMap((move) => {
    if (move.id === 'pyramid.remove') {
      const from = (move.payload as { from?: PyramidSource } | undefined)?.from;
      return from ? [from] : [];
    }
    if (move.id === 'pyramid.pair') {
      const payload = move.payload as { a?: PyramidSource; b?: PyramidSource } | undefined;
      return [payload?.a, payload?.b].filter((source): source is PyramidSource => Boolean(source));
    }
    return [];
  });
}
