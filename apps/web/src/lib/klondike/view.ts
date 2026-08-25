import type { LegalMove } from '@parlour/engine';
import {
  SUITS,
  suitOfCard,
  type KlondikeHint,
  type KlondikePlayerView,
  type KlondikeSuit,
} from '@parlour/game-klondike';
import type { KlondikeSnapshot } from '@/lib/solo/KlondikeTransport';

export type KlondikeZone = 'stock' | 'waste' | `tableau:${number}` | `foundation:${KlondikeSuit}`;

export interface KlondikeSelection {
  from: Exclude<KlondikeZone, 'stock'>;
  card: string;
  count: number;
}

export interface KlondikeTableView {
  mode: KlondikeSnapshot['mode'];
  dailyKey: string | null;
  stage: KlondikePlayerView['stage'];
  drawCount: 1 | 3;
  moves: number;
  recycles: number;
  stockCount: number;
  waste: readonly string[];
  foundations: Record<KlondikeSuit, readonly string[]>;
  tableau: KlondikePlayerView['tableau'];
  legal: readonly LegalMove[];
  canUndo: boolean;
  canFinish: boolean;
  hint: KlondikeHint | null;
}

export function klondikeTableView(
  snapshot: KlondikeSnapshot,
  legal: readonly LegalMove[],
): KlondikeTableView {
  const state = snapshot.session.state;
  return {
    mode: snapshot.mode,
    dailyKey: snapshot.dailyKey,
    stage: state.stage,
    drawCount: state.rules.drawCount,
    moves: state.moves,
    recycles: state.recycles,
    stockCount: state.stock.length,
    waste: state.waste,
    foundations: state.foundations,
    tableau: state.tableau,
    legal,
    canUndo: snapshot.canUndo,
    canFinish: snapshot.canFinish,
    hint: snapshot.hint,
  };
}

export function selectionForCard(
  view: KlondikeTableView,
  from: KlondikeSelection['from'],
  card: string,
): KlondikeSelection | null {
  const sourceMoves = view.legal.filter((move) => sourceOfMove(move, view) === from);
  if (from.startsWith('tableau:')) {
    const column = Number(from.split(':')[1]);
    const up = view.tableau[column]?.up ?? [];
    const index = up.indexOf(card);
    if (index < 0) return null;
    const selection = { from, card, count: up.length - index } satisfies KlondikeSelection;
    return sourceMoves.some((move) => cardOfMove(move, view) === card) ? selection : null;
  }
  return sourceMoves.some((move) => cardOfMove(move, view) === card)
    ? { from, card, count: 1 }
    : null;
}

export function moveForTarget(
  view: KlondikeTableView,
  selection: KlondikeSelection,
  target: KlondikeZone,
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
  view: KlondikeTableView,
  selection: KlondikeSelection | null,
): KlondikeZone[] {
  if (!selection) return [];
  return view.legal
    .filter(
      (move) =>
        sourceOfMove(move, view) === selection.from && cardOfMove(move, view) === selection.card,
    )
    .map((move) => targetOfMove(move, view))
    .filter((zone): zone is KlondikeZone => zone !== null);
}

export function sourceOfMove(move: LegalMove, _view: KlondikeTableView): KlondikeZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.draw':
      return 'stock';
    case 'stock.recycle':
    case 'waste.toTableau':
    case 'waste.toFoundation':
      return 'waste';
    case 'tableau.move':
    case 'tableau.toFoundation': {
      const from = numberField(payload, 'from');
      return from === null ? null : `tableau:${from}`;
    }
    case 'foundation.toTableau': {
      const suit = payload.suit;
      return typeof suit === 'string' && SUITS.includes(suit as KlondikeSuit)
        ? `foundation:${suit as KlondikeSuit}`
        : null;
    }
    default:
      return null;
  }
}

export function targetOfMove(move: LegalMove, view: KlondikeTableView): KlondikeZone | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'stock.draw':
      return 'waste';
    case 'stock.recycle':
      return 'stock';
    case 'tableau.move':
    case 'waste.toTableau':
    case 'foundation.toTableau': {
      const to = numberField(payload, 'to');
      return to === null ? null : `tableau:${to}`;
    }
    case 'waste.toFoundation': {
      const card = view.waste.at(-1);
      const suit = card ? suitOfCard(card) : null;
      return suit ? `foundation:${suit}` : null;
    }
    case 'tableau.toFoundation': {
      const from = numberField(payload, 'from');
      const card = from === null ? null : view.tableau[from]?.up.at(-1);
      const suit = card ? suitOfCard(card) : null;
      return suit ? `foundation:${suit}` : null;
    }
    default:
      return null;
  }
}

export function cardOfMove(move: LegalMove, view: KlondikeTableView): string | null {
  const payload = recordPayload(move);
  switch (move.id) {
    case 'tableau.move':
      return typeof payload.card === 'string' ? payload.card : null;
    case 'tableau.toFoundation': {
      const from = numberField(payload, 'from');
      return from === null ? null : (view.tableau[from]?.up.at(-1) ?? null);
    }
    case 'waste.toTableau':
    case 'waste.toFoundation':
      return view.waste.at(-1) ?? null;
    case 'foundation.toTableau': {
      const suit = payload.suit;
      return typeof suit === 'string' && SUITS.includes(suit as KlondikeSuit)
        ? (view.foundations[suit as KlondikeSuit].at(-1) ?? null)
        : null;
    }
    default:
      return null;
  }
}

export function describeHint(hint: KlondikeHint | null, _view: KlondikeTableView): string | null {
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
