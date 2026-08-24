import {
  isVeilHandle,
  stableCardOrder,
  type CardFace,
  type CardId,
  type DeckDef,
  type HandOrder,
} from '@parlour/engine';

export const SPITE_COLORS = ['red', 'yellow', 'green', 'blue'] as const;

export type SpiteColor = (typeof SPITE_COLORS)[number];

/**
 * Ranks run Ace (1) through Queen (12); a build pile climbs that whole ladder
 * and is retired the moment its top reads Queen. The King (13) never sits in
 * the sequence — it exists only to stand in for a rank that does.
 */
export const ACE = 1;
export const QUEEN = 12;
export const KING = 13;

const RANK_LABELS: Readonly<Record<number, string>> = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

/** Every face the table can hold. */
export type SpiteKind =
  | 'number'
  /** a King — always wild when dealt at all */
  | 'wild'
  | 'joker'
  /** a card dealt under Veil: present at the table, unreadable by it */
  | 'veiled';

export interface SpiteCardMeta extends Record<string, unknown> {
  kind: SpiteKind;
  /**
   * The rank this face builds as. Wilds keep their nominal rank here for
   * display; what a played wild actually stands for lives in the state's
   * `wildRanks`, never in the face.
   */
  value: number;
}

export interface SpiteFace extends CardFace {
  color?: SpiteColor;
  meta: SpiteCardMeta;
}

function makeFace(color: SpiteColor | undefined, kind: SpiteKind, value: number): SpiteFace {
  const label = kind === 'joker' ? 'joker' : `${color} ${rankLabel(value)}`;
  return {
    label,
    short: kind === 'joker' ? '★' : rankLabel(value),
    ...(color ? { color } : {}),
    rank: value,
    meta: { kind, value },
  };
}

const cardIds: CardId[] = [];
const faces: Record<CardId, SpiteFace> = {};

for (let copy = 0; copy < 3; copy++) {
  for (const color of SPITE_COLORS) {
    for (let rank = ACE; rank <= KING; rank++) {
      const id = `${color}-${rankLabel(rank)}-${copy}`;
      cardIds.push(id);
      faces[id] = makeFace(color, rank === KING ? 'wild' : 'number', rank);
    }
  }
  // Three jokers per deck, matching one per standard deck's usual pair-plus.
  for (let joker = 0; joker < 3; joker++) {
    const id = `joker-${copy * 3 + joker}`;
    cardIds.push(id);
    faces[id] = makeFace(undefined, 'joker', 0);
  }
}

/** Every card the pack can ever deal: three decks' worth, 165 faces. */
export const spiteDeck: DeckDef = {
  id: 'spite-165',
  cardIds,
  faces,
};

/**
 * The deck a table actually shuffles. Two decks (110 cards) carry the classic
 * two- and three-seat game; four seats need a third so the opening deal cannot
 * eat nearly the whole stock. A wild family switched off stays home rather
 * than arriving as dead weight — nothing else can legally play a King to the
 * centre, and an unplayable fifth of the deck would only clog every hand.
 */
export function dealtDeck(seats: number, kingsWild: boolean, jokersWild: boolean): DeckDef {
  const deckCount = seats <= 3 ? 2 : 3;
  const ids: CardId[] = [];
  for (let deck = 0; deck < deckCount; deck++) {
    for (const color of SPITE_COLORS) {
      for (let rank = ACE; rank <= KING; rank++) {
        if (rank === KING && !kingsWild) continue;
        ids.push(`${color}-${rankLabel(rank)}-${deck}`);
      }
    }
    if (jokersWild) {
      for (let joker = 0; joker < 3; joker++) ids.push(`joker-${deck * 3 + joker}`);
    }
  }
  return { id: `spite-${deckCount}d`, cardIds: ids, faces };
}

/**
 * The face every veiled handle wears. It matches nothing and plays on nothing,
 * so a rule that reaches for a hidden card's rank gets a definite "no" instead
 * of a crash.
 */
export const SPITE_VEILED_FACE: SpiteFace = Object.freeze({
  label: 'face down',
  short: '',
  meta: Object.freeze({ kind: 'veiled', value: 0 }) as SpiteCardMeta,
});

export function spiteFace(card: CardId): SpiteFace {
  const face = faces[card];
  if (face) return face;
  if (isVeilHandle(card)) return SPITE_VEILED_FACE;
  throw new Error(`unknown spite card: ${card}`);
}

export function isWildCard(card: CardId): boolean {
  const kind = spiteFace(card).meta.kind;
  return kind === 'wild' || kind === 'joker';
}

const HAND_COLOR_ORDER: Readonly<Record<SpiteColor, number>> = {
  red: 1,
  yellow: 2,
  green: 3,
  blue: 4,
};

/**
 * Low ranks first — they are the ones an early pile wants — with wilds held to
 * the end where the eye finds them fast. Presentation only; the authoritative
 * zone is never touched.
 */
export const orderSpiteHand: HandOrder = (cards) =>
  stableCardOrder(cards, (left, right) => {
    const a = faces[left];
    const b = faces[right];
    if (!a || a.meta.kind === 'veiled') return b && b.meta.kind !== 'veiled' ? 1 : 0;
    if (!b || b.meta.kind === 'veiled') return -1;
    const wildDiff = Number(isWildKind(a.meta.kind)) - Number(isWildKind(b.meta.kind));
    if (wildDiff !== 0) return wildDiff;
    const valueDiff = a.meta.value - b.meta.value;
    if (valueDiff !== 0) return valueDiff;
    const colorDiff =
      (a.color ? HAND_COLOR_ORDER[a.color] : 0) - (b.color ? HAND_COLOR_ORDER[b.color] : 0);
    if (colorDiff !== 0) return colorDiff;
    return left.localeCompare(right);
  });

function isWildKind(kind: SpiteKind): boolean {
  return kind === 'wild' || kind === 'joker';
}
