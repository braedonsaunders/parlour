import type { LegalMove } from '@parlour/engine';
import { leftoverOf, type GolfHint, type GolfPlayerView } from '@parlour/game-golf';
import type { GolfSnapshot } from '@/lib/solo/GolfTransport';
import { attachDeferredHint } from '@/lib/solo/deferHint';

export type GolfZone = 'stock' | 'waste' | `tableau:${number}`;

export interface GolfTableView {
  mode: GolfSnapshot['mode'];
  dailyKey: string | null;
  stage: GolfPlayerView['stage'];
  wrap: boolean;
  moves: number;
  leftover: number;
  stockCount: number;
  waste: readonly string[];
  tableau: readonly (readonly string[])[];
  legal: readonly LegalMove[];
  canUndo: boolean;
  undoDepth: number;
  hint: GolfHint | null;
}

export function golfTableView(snapshot: GolfSnapshot, legal: readonly LegalMove[]): GolfTableView {
  const state = snapshot.session.state;
  return attachDeferredHint(
    {
      mode: snapshot.mode,
      dailyKey: snapshot.dailyKey,
      stage: state.stage,
      wrap: state.rules.wrap,
      moves: state.moves,
      leftover: leftoverOf(state),
      stockCount: state.stock.length,
      waste: state.waste,
      tableau: state.tableau,
      legal,
      canUndo: snapshot.canUndo,
      undoDepth: snapshot.undoDepth,
    },
    // Forwarded lazily: reading this runs the solver, and the table only reads
    // it while a hint is on screen. See GolfTransport.getSnapshot.
    () => snapshot.hint,
  );
}

export function sourceOfMove(move: LegalMove): GolfZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.draw':
      return 'stock';
    case 'tableau.play': {
      const from = numberField(payload, 'from');
      return from === null ? null : `tableau:${from}`;
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove): GolfZone | null {
  switch (move.id) {
    case 'stock.draw':
    case 'tableau.play':
      return 'waste';
    default:
      return null;
  }
}

export function cardOfMove(move: LegalMove, view: GolfTableView): string | null {
  if (move.id !== 'tableau.play') return null;
  const from = numberField(recordPayload(move), 'from');
  return from === null ? null : (view.tableau[from]?.at(-1) ?? null);
}

export function describeHint(hint: GolfHint | null, view: GolfTableView): string | null {
  if (!hint) return null;
  const from = sourceOfMove(hint.move);
  const card = cardOfMove(hint.move, view);
  return [hint.reason, card && `${card}:`, from, '→ hole'].filter(Boolean).join(' ');
}

export function playableColumns(view: GolfTableView): readonly number[] {
  return view.legal.flatMap((move) => {
    if (move.id !== 'tableau.play') return [];
    const from = numberField(recordPayload(move), 'from');
    return from === null ? [] : [from];
  });
}

function recordPayload(move: LegalMove): Record<string, unknown> {
  return typeof move.payload === 'object' && move.payload !== null
    ? (move.payload as Record<string, unknown>)
    : {};
}

function numberField(payload: Record<string, unknown>, key: string): number | null {
  return typeof payload[key] === 'number' ? payload[key] : null;
}
