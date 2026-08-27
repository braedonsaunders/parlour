'use client';

import { useEffect, useMemo } from 'react';
import type { FxEvent } from '@parlour/engine';
import { useT, type MessageKey, type Translator } from '@/lib/i18n';
import { useTableAnnouncer } from './TableShell';

export type SolitaireNarrationGame =
  'klondike' | 'freecell' | 'spider' | 'pyramid' | 'golf' | 'tripeaks';

/** Summarises one solitaire action instead of reading every card flight. */
export function useSolitaireNarration(
  game: SolitaireNarrationGame,
  fx: readonly FxEvent[],
  fxKey: string | number,
): void {
  const t = useT();
  const announce = useTableAnnouncer();
  const narration = useMemo(() => narrateSolitaireFx(game, fx, t), [fx, game, t]);

  useEffect(() => announce(narration), [announce, fxKey, narration]);
}

export function narrateSolitaireFx(
  game: SolitaireNarrationGame,
  fx: readonly FxEvent[],
  t: Translator,
): string {
  const actions: string[] = [];
  const reveals: string[] = [];

  for (const event of fx) {
    const payload = record(event.payload);
    if (!payload) continue;

    if (event.kind.endsWith('.cards-move')) {
      const cards = stringArray(payload.cards);
      const from = stringField(payload, 'from');
      const to = stringField(payload, 'to');
      if (cards.length > 0 && from && to) {
        actions.push(movedCards(game, cards, from, to, t));
      }
      continue;
    }

    if (event.kind === 'tripeaks.play') {
      const cards = stringArray(payload.cards);
      const from = stringField(payload, 'from');
      const to = stringField(payload, 'to');
      if (cards.length > 0 && from && to) {
        actions.push(movedCards(game, cards, from, to, t));
      }
      continue;
    }

    if (event.kind === 'tripeaks.stock-flip') {
      const card = stringField(payload, 'card');
      const from = stringField(payload, 'from');
      const to = stringField(payload, 'to');
      if (card && from && to) actions.push(movedCards(game, [card], from, to, t));
      continue;
    }

    if (event.kind.endsWith('.stock-draw')) {
      const cards = stringArray(payload.cards);
      const card = stringField(payload, 'card');
      const drawn = cards.length > 0 ? cards : card ? [card] : [];
      if (drawn.length > 0) actions.push(movedCards(game, drawn, 'stock', 'waste', t));
      continue;
    }

    if (event.kind === 'card.flip') {
      const card = stringField(payload, 'card');
      const zone = stringField(payload, 'to') ?? stringField(payload, 'from');
      if (card && zone) {
        reveals.push(
          t('solitaire.narration.revealed', {
            card: cardName(card, t),
            zone: zoneName(game, zone, t),
          }),
        );
      }
      continue;
    }

    if (event.kind === 'pyramid.pair') {
      const cards = stringArray(payload.cards);
      if (cards.length >= 2) {
        actions.push(
          t('solitaire.narration.pairRemoved', {
            first: cardName(cards[0]!, t),
            second: cardName(cards[1]!, t),
          }),
        );
      }
      continue;
    }

    if (event.kind === 'pyramid.remove') {
      const card = stringField(payload, 'card');
      if (card) actions.push(t('solitaire.narration.removed', { card: cardName(card, t) }));
      continue;
    }

    if (event.kind === 'spider.stock-deal' && typeof payload.count === 'number') {
      actions.push(t('solitaire.narration.stockDeal', { count: payload.count }));
      continue;
    }

    if (event.kind.endsWith('.stock-recycle')) {
      actions.push(t('solitaire.narration.recycled'));
    }
  }

  // Automatic flips carry more information than a fourth transfer. Keep one
  // reveal even when Spider clears a run in the same settled action.
  const actionLimit = reveals.length > 0 ? 2 : 3;
  return [...actions.slice(0, actionLimit), ...reveals.slice(-1)].join(' ');
}

function movedCards(
  game: SolitaireNarrationGame,
  cards: readonly string[],
  from: string,
  to: string,
  t: Translator,
): string {
  const zones = { from: zoneName(game, from, t), to: zoneName(game, to, t) };
  return cards.length === 1
    ? t('solitaire.narration.moved', { card: cardName(cards[0]!, t), ...zones })
    : t('solitaire.narration.movedRun', { count: cards.length, ...zones });
}

const SUIT_KEYS: Readonly<Record<string, MessageKey>> = {
  S: 'solitaire.suit.spades',
  H: 'solitaire.suit.hearts',
  D: 'solitaire.suit.diamonds',
  C: 'solitaire.suit.clubs',
};

const SUIT_IDS: Readonly<Record<string, string>> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const RANK_KEYS: Readonly<Record<number, MessageKey>> = {
  1: 'solitaire.rank.ace',
  11: 'solitaire.rank.jack',
  12: 'solitaire.rank.queen',
  13: 'solitaire.rank.king',
};

function cardName(card: string, t: Translator): string {
  const match = /^([SHDC])(\d{1,2})[a-z]?$/.exec(card);
  if (!match) return t('narration.card');
  const rank = Number(match[2]);
  const suitKey = SUIT_KEYS[match[1]!];
  if (!suitKey || rank < 1 || rank > 13) return t('narration.card');
  return t('solitaire.card', {
    rank: RANK_KEYS[rank] ? t(RANK_KEYS[rank]) : rank,
    suit: t(suitKey),
  });
}

function zoneName(game: SolitaireNarrationGame, zone: string, t: Translator): string {
  if (zone === 'stock') return t('solitaire.zone.stock');
  if (zone === 'waste') {
    return t(game === 'golf' ? 'solitaire.zone.hole' : 'solitaire.zone.waste');
  }
  if (zone === 'hole') return t('solitaire.zone.hole');

  const tableau = /^tableau:(\d+)$/.exec(zone);
  if (tableau) return t('solitaire.zone.tableau', { column: Number(tableau[1]) + 1 });

  const foundation = /^foundation:(.+)$/.exec(zone);
  if (foundation) {
    const suit = foundation[1];
    const suitKey = suit ? SUIT_KEYS[SUIT_IDS[suit] ?? ''] : undefined;
    return suitKey
      ? t('solitaire.zone.suitFoundation', { suit: t(suitKey) })
      : t('solitaire.zone.foundation', { foundation: Number(suit) + 1 });
  }

  const cell = /^cell:(\d+)$/.exec(zone);
  if (cell) return t('solitaire.zone.cell', { cell: Number(cell[1]) + 1 });

  const pyramid = /^pyramid:(\d+):(\d+)$/.exec(zone);
  if (pyramid) {
    return t('solitaire.zone.pyramid', {
      row: Number(pyramid[1]) + 1,
      card: Number(pyramid[2]) + 1,
    });
  }
  return t('solitaire.zone.table');
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === 'string' ? payload[key] : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
