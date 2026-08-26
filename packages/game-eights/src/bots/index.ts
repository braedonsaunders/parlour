import type { BotPolicy } from '@parlour/engine';
import { isWild, suitOf } from '../cards';
import type { EightsState } from '../state';
import {
  bestBy,
  cardPlayScore,
  closestRival,
  firstOf,
  payloadSuit,
  preferredSuit,
  suitLength,
} from './evaluate';
import { regularPersona, rookiePersona, sharpPersona } from './personas';

/**
 * Crazy Eights tier ladder — three policies that play the game with increasing
 * awareness of suit depth, action pressure, and eight conservation.
 */

const easyBot: BotPolicy<EightsState> = {
  id: 'eights-easy',
  label: 'Easy',
  tier: 1,
  persona: rookiePersona,
  chooseMove(view, seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;
    const suits = legal.filter((move) => move.id === 'chooseSuit');
    if (suits.length > 0) return suits[rng.int(suits.length)] ?? null;
    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length > 0) return plays[rng.int(plays.length)] ?? null;
    return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;
  },
};

/**
 * The house bot plays the way most people do: shed expensive cards, stay in
 * the suit you hold most of, and keep the eight in reserve.
 */
const mediumBot: BotPolicy<EightsState> = {
  id: 'eights-medium',
  label: 'Regular',
  tier: 2,
  persona: regularPersona,
  chooseMove(view, seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;

    const suitMove = legal.find(
      (move) => move.id === 'chooseSuit' && payloadSuit(move) === preferredSuit(view, seat),
    );
    if (suitMove) return suitMove;

    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length > 0) {
      const plain = plays.filter((move) => {
        const card = (move.payload as { card?: unknown } | undefined)?.card;
        return typeof card === 'string' && !isWild(card);
      });
      const pool = plain.length > 0 ? plain : plays;
      return bestBy(pool, rng, (move) => {
        const card = (move.payload as { card?: unknown } | undefined)?.card;
        if (typeof card !== 'string') return -1;
        if (isWild(card)) return 0;
        return cardValue(card) * 4 + suitLength(view, seat, suitOf(card)) * 3;
      });
    }
    return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;
  },
};

/**
 * Hard bot: suit management, pressure awareness, and eight conservation.
 *
 * The central heuristics:
 *   1. Never spend an eight when a plain match exists — the eight is the
 *      safety net and it comes out only when nothing else goes.
 *   2. When choosing a suit for an eight, pick the one held most deeply.
 *   3. Action cards (draw-two, skip, reverse) gain value when a rival is
 *      within striking distance of going out.
 *   4. Shed high-value cards first, but only when the suit they land in is
 *      one this seat can keep supplying.
 */
const hardBot: BotPolicy<EightsState> = {
  id: 'eights-hard',
  label: 'Sharp',
  tier: 3,
  persona: sharpPersona,
  chooseMove(view, seat, legal, rng) {
    const ready = legal.find((move) => move.id === 'ready');
    if (ready) return ready;

    // Suit choice: pick the suit we hold most of, breaking ties toward the
    // highest count — an eight played into a suit we dominate wins rounds.
    const suits = legal.filter((move) => move.id === 'chooseSuit');
    if (suits.length > 0) {
      const best = bestBy(suits, rng, (move) => {
        const suit = payloadSuit(move);
        return suit === null ? -1 : suitLength(view, seat, suit) * 10;
      });
      if (best) return best;
    }

    const plays = legal.filter((move) => move.id === 'playCard');
    if (plays.length === 0) return firstOf(legal, 'draw', 'pass') ?? legal[0] ?? null;

    const pressure = closestRival(view, seat) <= 2;
    const { rules } = view;

    // Rule 1: if a plain match exists, do not spend an eight.
    const plain = plays.filter((move) => {
      const card = (move.payload as { card?: unknown } | undefined)?.card;
      return typeof card === 'string' && !isWild(card);
    });
    if (plain.length > 0) {
      return bestBy(plain, rng, (move) => cardPlayScore(move, view, seat, pressure, rules));
    }

    // No plain match — the eight is all we have. Spend it.
    return bestBy(plays, rng, (move) => cardPlayScore(move, view, seat, pressure, rules));
  },
};

function cardValue(card: string): number {
  const rank = Number.parseInt(card.slice(1), 10);
  if (!Number.isInteger(rank)) return 0;
  if (rank === 8) return 50;
  if (rank >= 10) return 10;
  return rank;
}

export { easyBot, mediumBot, hardBot };

export const EIGHTS_BOTS: readonly BotPolicy<EightsState>[] = [easyBot, mediumBot, hardBot];

export function eightsTierBot(tier: 1 | 2 | 3): BotPolicy<EightsState> {
  const bot = EIGHTS_BOTS[tier - 1];
  if (!bot) throw new Error(`no Eights bot for tier ${tier}`);
  return bot;
}