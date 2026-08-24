import {
  isVeilHandle,
  stableCardOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

export const WILDPILE_COLORS = ['red', 'yellow', 'green', 'blue'] as const;

export type WildpileColor = (typeof WILDPILE_COLORS)[number];

/**
 * Every face the pile can hold. The first six make up the standard 108-card
 * deck; the two swap wilds are the optional extras dealt in when the table
 * turns on hand-swapping.
 */
export type WildpileKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw-two'
  | 'wild'
  | 'wild-draw-four'
  | 'wild-swap'
  | 'wild-shuffle'
  /** a card dealt under Veil: present at the table, unreadable by it */
  | 'veiled';

/** Wilds pick a color; two of them also move hands around the table. */
export const WILDPILE_WILD_KINDS: readonly WildpileKind[] = [
  'wild',
  'wild-draw-four',
  'wild-swap',
  'wild-shuffle',
];

export function isWildKind(kind: WildpileKind): boolean {
  return WILDPILE_WILD_KINDS.includes(kind);
}

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

/** The standard deck ends here; everything after is opt-in. */
const baseCardIds: CardId[] = cardIds.slice();

for (let copy = 0; copy < 2; copy++) {
  add(`wild-swap-${copy}`, {
    label: 'wild swap hands',
    short: '⇄',
    meta: { kind: 'wild-swap' },
  });
  add(`wild-shuffle-${copy}`, {
    label: 'wild shuffle hands',
    short: '↻↻',
    meta: { kind: 'wild-shuffle' },
  });
}

export const wildpileDeck: DeckDef = {
  id: 'wildpile-116',
  cardIds,
  faces,
};

/** The 108 cards every Wild table deals, without the optional swap wilds. */
export const WILDPILE_BASE_CARD_IDS: readonly CardId[] = baseCardIds;

/** The four optional swap wilds, dealt in only when the table enables them. */
export const WILDPILE_SWAP_CARD_IDS: readonly CardId[] = cardIds.filter(
  (id) => !baseCardIds.includes(id),
);

/**
 * The face every veiled handle wears. It matches nothing and plays on nothing,
 * so a rule that reaches for a hidden card's colour or kind gets a definite
 * "no" instead of a crash — and no rule can accidentally read through the veil.
 */
export const WILDPILE_VEILED_FACE: WildpileFace = Object.freeze({
  label: 'face down',
  short: '',
  meta: Object.freeze({ kind: 'veiled' }) as WildpileCardMeta,
});

export function wildpileFace(card: CardId): WildpileFace {
  const face = faces[card];
  if (face) return face;
  if (isVeilHandle(card)) return WILDPILE_VEILED_FACE;
  throw new Error(`unknown wildpile card: ${card}`);
}

export function isVeiledFace(face: WildpileFace): boolean {
  return face.meta.kind === 'veiled';
}

export function sameWildpileFace(left: CardId, right: CardId): boolean {
  const a = wildpileFace(left);
  const b = wildpileFace(right);
  if (isVeiledFace(a) || isVeiledFace(b)) return false;
  return a.color === b.color && a.meta.kind === b.meta.kind && a.meta.value === b.meta.value;
}

const HAND_COLOR_ORDER: Readonly<Record<WildpileColor, number>> = {
  red: 1,
  yellow: 2,
  green: 3,
  blue: 4,
};

const HAND_KIND_ORDER: Readonly<Record<WildpileKind, number>> = {
  number: 0,
  skip: 10,
  reverse: 11,
  'draw-two': 12,
  wild: 0,
  'wild-draw-four': 1,
  'wild-swap': 2,
  'wild-shuffle': 3,
  veiled: 99,
};

/** UNO Mobile order: wilds, then red/yellow/green/blue; numbers before actions. */
export const orderWildpileHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const a = faces[left];
    const b = faces[right];
    if (!a || a.meta.kind === 'veiled') return b && b.meta.kind !== 'veiled' ? 1 : 0;
    if (!b || b.meta.kind === 'veiled') return -1;
    const colorDiff =
      (a.color ? HAND_COLOR_ORDER[a.color] : 0) - (b.color ? HAND_COLOR_ORDER[b.color] : 0);
    if (colorDiff !== 0) return colorDiff;
    const kindDiff = HAND_KIND_ORDER[a.meta.kind] - HAND_KIND_ORDER[b.meta.kind];
    if (kindDiff !== 0) return kindDiff;
    const valueDiff = (a.meta.value ?? 0) - (b.meta.value ?? 0);
    return valueDiff || left.localeCompare(right);
  });
