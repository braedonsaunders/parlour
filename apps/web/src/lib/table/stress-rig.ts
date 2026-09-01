/**
 * A repeatable worst case for the table renderer.
 *
 * Real tables are the honest thing to profile, but they are also the useless
 * thing to profile: a solo Wild table deals a different hand every run, paces
 * its bots against the fx timeline, and caps out at four seats. Two runs of the
 * same "stress test" would differ by more than any change worth making.
 *
 * So the rig keeps the renderer and throws away the rules. It emits the exact
 * fx vocabulary Wild emits — a turn ring, a discard, an action call, a stacked
 * pickup counted out card by card — from a seeded generator, at a fixed rate,
 * into a table of whatever size we ask for. Same seed, same cards, same burst
 * timings, on every run and every device.
 *
 * Nothing here ships to a player. It exists so a frame-time number means
 * something when compared to the one before it.
 */

import { Fx, type FxEvent } from '@parlour/engine';
import { WILDPILE_COLORS, wildpileDeck } from '@parlour/game-wildpile';
import type { WildTableView } from '@/lib/wild/view';

export interface StressConfig {
  /** Seats at the table, local seat included. `seats: 7` is you plus six bots. */
  seats: number;
  /** Cards in the local hand. Wild hands run long once penalties stack. */
  hand: number;
  /** Cards each opponent is holding. */
  opponentHand: number;
  /** Milliseconds between bursts. Lower than any real bot pace, deliberately. */
  stepMs: number;
  /** Cards in a stacked pickup, every `pickupEvery` bursts. */
  pickup: number;
  pickupEvery: number;
  seed: number;
}

export const STRESS_DEFAULTS: StressConfig = {
  seats: 7,
  hand: 18,
  opponentHand: 12,
  stepMs: 420,
  pickup: 6,
  pickupEvery: 4,
  seed: 20260824,
};

export function stressConfigFromSearch(search: string): StressConfig {
  const params = new URLSearchParams(search);
  const num = (key: string, fallback: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    seats: clamp(num('seats', STRESS_DEFAULTS.seats), 2, 8),
    hand: clamp(num('hand', STRESS_DEFAULTS.hand), 1, 40),
    opponentHand: clamp(num('opponentHand', STRESS_DEFAULTS.opponentHand), 0, 40),
    stepMs: clamp(num('stepMs', STRESS_DEFAULTS.stepMs), 60, 5_000),
    pickup: clamp(num('pickup', STRESS_DEFAULTS.pickup), 0, 20),
    pickupEvery: clamp(num('pickupEvery', STRESS_DEFAULTS.pickupEvery), 1, 50),
    seed: num('seed', STRESS_DEFAULTS.seed),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Mulberry32 — small, fast, and identical in every browser. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every card the deck can hold, wilds included, so the fan carries the same mix
 * of faces (and therefore the same paint cost) a real hand does.
 */
const DECK: readonly string[] = wildpileDeck.cardIds;

const AVATARS = ['fox', 'owl', 'bear', 'hare', 'stag', 'crow', 'moth', 'newt'];
const NAMES = ['Wren', 'Bram', 'Sol', 'Ines', 'Kip', 'Marlo', 'Odette', 'Tuck'];

export interface StressStep {
  view: WildTableView;
  fx: readonly FxEvent[];
  fxKey: number;
}

/**
 * The rig's state machine. Held outside React so the driver component can be a
 * thin `useState` over it and the burst schedule never depends on render order.
 */
export class StressRig {
  private readonly config: StressConfig;
  private readonly random: () => number;
  private deckCursor = 0;
  private hand: string[];
  private opponentCounts: number[];
  private discard: string[];
  private stock: number;
  private turn: number;
  private direction: 1 | -1 = 1;
  private burst = 0;

  constructor(config: StressConfig) {
    this.config = config;
    this.random = rng(config.seed);
    this.hand = Array.from({ length: config.hand }, () => this.nextCard());
    this.opponentCounts = Array.from({ length: config.seats - 1 }, () => config.opponentHand);
    this.discard = [this.nextCard(), this.nextCard(), this.nextCard()];
    this.stock = 60;
    this.turn = 1 % config.seats;
  }

  /** Deals from the deck in seeded order, never repeating a live card id. */
  private nextCard(): string {
    // A hand is a React key space: a duplicate id would silently collapse two
    // cards into one and quietly make the stress test easier than the game.
    for (let attempt = 0; attempt < DECK.length; attempt += 1) {
      const card = DECK[(this.deckCursor + attempt) % DECK.length]!;
      if (!this.hand?.includes(card) && !this.discard?.includes(card)) {
        this.deckCursor = (this.deckCursor + attempt + 1) % DECK.length;
        return card;
      }
    }
    this.deckCursor = (this.deckCursor + 1) % DECK.length;
    return DECK[this.deckCursor]!;
  }

  /** The table as it looks before any burst has played. */
  opening(): StressStep {
    return { view: this.view(null), fx: [], fxKey: 0 };
  }

  /**
   * One turn's worth of table: somebody plays, the pile answers, and every so
   * often a stack lands on a seat and is counted out card by card.
   */
  next(): StressStep {
    this.burst += 1;
    const seat = this.turn;
    const local = seat === 0;
    const fx: FxEvent[] = [{ kind: Fx.TurnRing, payload: { seat }, at: 0 }];

    const played = local ? this.playFromHand() : this.nextCard();
    this.discard = [played, ...this.discard].slice(0, 3);
    fx.push({ kind: Fx.DiscardCard, payload: { card: played, seat, to: 'discard' }, at: 40 });
    if (!local) this.opponentCounts[seat - 1] = Math.max(0, this.count(seat) - 1);

    // The calls a Wild burst actually carries. Cycled rather than rolled, so
    // every run exercises the same mix of announcement layouts.
    const call = this.burst % 3;
    if (call === 0) {
      this.direction = this.direction === 1 ? -1 : 1;
      fx.push({ kind: 'wildpile.reverse', payload: { direction: this.direction }, at: 60 });
    } else if (call === 1) {
      fx.push({ kind: 'wildpile.skip', payload: { seat: this.nextSeat(seat) }, at: 60 });
    }

    const stacking = this.config.pickup > 0 && this.burst % this.config.pickupEvery === 0;
    if (stacking) {
      const victim = this.nextSeat(seat);
      const amount = this.config.pickup;
      fx.push({ kind: 'wildpile.draw-stack', payload: { seat: victim, amount }, at: 60 });
      fx.push({
        kind: 'wildpile.pickup',
        payload: { seat: victim, amount, reason: 'penalty' },
        at: 90,
      });
      for (let index = 0; index < amount; index += 1) {
        const card = this.nextCard();
        // Matches the engine's own pickup stagger: one card every 90ms.
        fx.push({
          kind: Fx.DrawCard,
          payload: { card, seat: victim, from: 'stock' },
          at: 120 + index * 90,
        });
        if (victim === 0) this.hand.push(card);
        else this.opponentCounts[victim - 1] = this.count(victim) + 1;
        this.stock = Math.max(0, this.stock - 1);
      }
    }

    // Keep the local hand near its target size: the fan's cost is the point of
    // the rig, and a hand that quietly drains would flatter every later run.
    while (this.hand.length > this.config.hand) this.hand.shift();
    while (this.hand.length < this.config.hand) this.hand.push(this.nextCard());

    this.turn = this.nextSeat(seat);
    return { view: this.view(this.turn), fx, fxKey: this.burst };
  }

  private playFromHand(): string {
    const index = Math.floor(this.random() * this.hand.length);
    return this.hand.splice(index, 1)[0] ?? this.nextCard();
  }

  private count(seat: number): number {
    return this.opponentCounts[seat - 1] ?? 0;
  }

  private nextSeat(from: number): number {
    const { seats } = this.config;
    return (from + this.direction + seats) % seats;
  }

  private view(activeSeat: number | null): WildTableView {
    const { seats } = this.config;
    const players = Array.from({ length: seats }, (_, seat) => ({
      seat,
      name: seat === 0 ? 'You' : (NAMES[seat % NAMES.length] ?? `Seat ${seat}`),
      avatarId: AVATARS[seat % AVATARS.length] ?? 'fox',
      handCount: seat === 0 ? this.hand.length : this.count(seat),
      isLocal: seat === 0,
      isBot: seat !== 0,
      lastCardArmed: false,
    }));
    // Half the fan legal: the rig has to pay for both the lit and the greyed
    // card treatments, which are the two most expensive states a card has.
    const playable = this.hand.filter((_, index) => index % 2 === 0);
    return {
      players,
      localSeat: 0,
      activeSeat,
      stockCount: this.stock,
      discard: this.discard,
      activeColor: WILDPILE_COLORS[this.burst % WILDPILE_COLORS.length] ?? 'red',
      direction: this.direction,
      pendingDraw: this.burst % this.config.pickupEvery === 0 ? this.config.pickup : 0,
      phaseLabel: 'stress pile · one deal',
      hand: this.hand,
      decision: activeSeat === 0 ? 'play' : null,
      lastCardArmed: false,
      drawnCard: null,
      challenge: null,
      catchable: null,
      legal: {
        playCards: activeSeat === 0 ? playable : [],
        draw: activeSeat === 0,
        declineJump: false,
        chooseColor: false,
        callLastCard: false,
        catchLastCard: false,
        challengeDrawFour: false,
        pass: false,
        swapTargets: [],
      },
    };
  }
}
