import type { CardFace, CardId, DeckDef } from '@parlour/engine';

export const WILDPILE_COLORS = ['red', 'yellow', 'green', 'blue'] as const;

export type WildpileColor = (typeof WILDPILE_COLORS)[number];
export type WildpileKind = 'number' | 'skip' | 'reverse' | 'draw-two' | 'wild' | 'wild-draw-four';

export interface WildpileCardMeta extends Record<string, unknown> {
  kind: WildpileKind;
  value?: number;
}

export interface WildpileFace extends CardFace {
  color?: WildpileColor;
  meta: WildpileCardMeta;
}

const cardIds: CardId[] = [];
const faces: Record<CardId, WildpileFace> = {};

function add(id: CardId, face: WildpileFace): void {
  cardIds.push(id);
  faces[id] = face;
}

for (const color of WILDPILE_COLORS) {
  add(`${color}-0-0`, {
    label: `${color} 0`,
    short: '0',
    color,
    rank: 0,
    meta: { kind: 'number', value: 0 },
  });

  for (let value = 1; value <= 9; value++) {
    for (let copy = 0; copy < 2; copy++) {
      add(`${color}-${value}-${copy}`, {
        label: `${color} ${value}`,
        short: String(value),
        color,
        rank: value,
        meta: { kind: 'number', value },
      });
    }
  }

  for (const kind of ['skip', 'reverse', 'draw-two'] as const) {
    for (let copy = 0; copy < 2; copy++) {
      const short = kind === 'skip' ? '⊘' : kind === 'reverse' ? '↻' : '+2';
      add(`${color}-${kind}-${copy}`, {
        label: `${color} ${kind}`,
        short,
        color,
        meta: { kind },
      });
    }
  }
}

for (let copy = 0; copy < 4; copy++) {
  add(`wild-${copy}`, {
    label: 'wild',
    short: 'W',
    meta: { kind: 'wild' },
  });
  add(`wild-draw-four-${copy}`, {
    label: 'wild draw four',
    short: '+4',
    meta: { kind: 'wild-draw-four' },
  });
}

export const wildpileDeck: DeckDef = {
  id: 'wildpile-108',
  cardIds,
  faces,
};

export function wildpileFace(card: CardId): WildpileFace {
  const face = faces[card];
  if (!face) throw new Error(`unknown wildpile card: ${card}`);
  return face;
}

export function sameWildpileFace(left: CardId, right: CardId): boolean {
  const a = wildpileFace(left);
  const b = wildpileFace(right);
  return a.color === b.color && a.meta.kind === b.meta.kind && a.meta.value === b.meta.value;
}
