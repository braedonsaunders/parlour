import { Fx, type FxEvent } from '@parlour/engine';

export const FX_TIMING = {
  cardFlightMs: 180,
  dealFlightMs: 220,
  drawFlightMs: 200,
  settleMs: 80,
  dealStaggerMinMs: 60,
  dealStaggerMaxMs: 90,
  knockMs: 900,
  blitzMs: 1100,
  showdownMs: 560,
  chipLossMs: 640,
  maxBurstMs: 1200,
} as const;

/**
 * A named table zone, optionally scoped by seat and then by pile.
 *
 * `stock`, `hand:2`, `payoff:1`, `discard:0:3`, `board:3`, `table`. It was a
 * closed list of five names, which meant a game with per-seat piles could not
 * name them: Spite emits `discard:<seat>:<pile>` and `centre:<pile>`, and the
 * list rejected both — throwing out of `delayUntilFxSettles`, which every solo
 * table calls to pace its bots, and taking the whole screen down with it.
 *
 * Widening this loses nothing real. Zone strings only ever become a
 * `[data-zone="..."]` lookup, and `zonePoint` already falls back to the table
 * centre when it finds no element, so an unknown zone degrades to a flight
 * that starts from the middle rather than a crash. The shape check below still
 * catches a malformed zone, which is what the list was actually buying.
 */
export type Zone =
  | 'stock'
  | 'discard'
  | 'peg'
  | 'centre'
  | 'table'
  | `${string}:${number}`
  | `${string}:${number}:${number}`;

type BaseCue = {
  id: string;
  startMs: number;
  durationMs: number;
  source: FxEvent;
};

export type FxCue =
  | (BaseCue & { type: 'deal'; card: string; from: Zone; to: Zone })
  | (BaseCue & { type: 'flip'; card: string; from: 'stock'; to: 'discard' })
  | (BaseCue & { type: 'draw'; card: string; from: Zone; to: `hand:${number}`; seat: number })
  | (BaseCue & {
      type: 'discard';
      card: string;
      from: `hand:${number}`;
      to: Zone;
      seat: number;
    })
  | (BaseCue & {
      type: 'trick-play';
      card: string;
      seat: number;
      index: number;
      from: `hand:${number}`;
      to: `seat:${number}`;
    })
  | (BaseCue & { type: 'trick-collect'; seat: number; count: number })
  | (BaseCue & { type: 'transfer'; card: string; from: Zone; to: Zone })
  | (BaseCue & { type: 'knock'; seat: number })
  | (BaseCue & { type: 'blitz'; seat: number; handValue: number })
  | (BaseCue & { type: 'showdown'; seat: number; handValue: number })
  | (BaseCue & { type: 'chip-loss'; seat: number; livesLeft: number })
  | (BaseCue & { type: 'turn'; seat: number })
  | (BaseCue & {
      type: 'gin-burst';
      burst: 'gin' | 'big-gin' | 'undercut';
      seat: number;
    })
  | (BaseCue & { type: 'layoff'; card: string; from: Zone; to: Zone });

type Payload = Record<string, unknown>;

function payloadOf(event: FxEvent): Payload {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    throw new Error(`${event.kind} fx requires an object payload`);
  }
  return event.payload as Payload;
}

function stringField(event: FxEvent, field: string): string {
  const value = payloadOf(event)[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${event.kind} fx requires a non-empty ${field}`);
  }
  return value;
}

function numberField(event: FxEvent, field: string): number {
  const value = payloadOf(event)[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${event.kind} fx requires a finite ${field}`);
  }
  return value;
}

function durationField(event: FxEvent, fallback: number): number {
  const value = payloadOf(event).dur;
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${event.kind} fx requires a positive dur`);
  }
  return Math.min(value, FX_TIMING.maxBurstMs);
}

/** Lower-case name, then any number of numeric scopes: `discard:0:3`. */
const ZONE_SHAPE = /^[a-z][a-z-]*(?::\d+)*$/;

function zoneField(event: FxEvent, field: string): Zone {
  const value = stringField(event, field);
  if (value === 'table' || ZONE_SHAPE.test(value)) return value as Zone;
  throw new Error(`${event.kind} fx has an invalid ${field} zone: ${value}`);
}

function cueFor(event: FxEvent, index: number): FxCue | null {
  const base = {
    id: `${index}:${event.kind}`,
    startMs: Math.max(0, event.at ?? 0),
    source: event,
  };

  switch (event.kind) {
    case Fx.DealCard:
      return {
        ...base,
        type: 'deal',
        card: stringField(event, 'card'),
        from: zoneField(event, 'from'),
        to: zoneField(event, 'to'),
        durationMs: durationField(event, FX_TIMING.dealFlightMs),
      };
    case Fx.FlipCard:
      return {
        ...base,
        type: 'flip',
        card: stringField(event, 'card'),
        from: 'stock',
        to: 'discard',
        durationMs: durationField(event, FX_TIMING.cardFlightMs),
      };
    case Fx.DrawCard: {
      const seat = numberField(event, 'seat');
      return {
        ...base,
        type: 'draw',
        card: stringField(event, 'card'),
        from: zoneField(event, 'from'),
        to: `hand:${seat}`,
        seat,
        durationMs: FX_TIMING.drawFlightMs,
      };
    }
    case Fx.DiscardCard: {
      const seat = numberField(event, 'seat');
      const to = payloadOf(event).to === undefined ? 'discard' : zoneField(event, 'to');
      return {
        ...base,
        type: 'discard',
        card: stringField(event, 'card'),
        from: `hand:${seat}`,
        to,
        seat,
        durationMs: FX_TIMING.cardFlightMs + FX_TIMING.settleMs,
      };
    }
    case Fx.Knock:
      return {
        ...base,
        type: 'knock',
        seat: numberField(event, 'seat'),
        durationMs: FX_TIMING.knockMs,
      };
    case Fx.Blitz:
      return {
        ...base,
        type: 'blitz',
        seat: numberField(event, 'seat'),
        handValue: numberField(event, 'handValue'),
        durationMs: FX_TIMING.blitzMs,
      };
    case Fx.ShowdownReveal: {
      // Blitz stamps handValue; Gin stamps deadwood — either drives the reveal
      const value = payloadOf(event).handValue ?? payloadOf(event).deadwood;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${event.kind} fx requires a finite handValue or deadwood`);
      }
      return {
        ...base,
        type: 'showdown',
        seat: numberField(event, 'seat'),
        handValue: value,
        durationMs: FX_TIMING.showdownMs,
      };
    }
    case Fx.ChipLoss:
      return {
        ...base,
        type: 'chip-loss',
        seat: numberField(event, 'seat'),
        livesLeft: numberField(event, 'livesLeft'),
        durationMs: FX_TIMING.chipLossMs,
      };
    case Fx.TurnRing:
      return {
        ...base,
        type: 'turn',
        seat: numberField(event, 'seat'),
        durationMs: FX_TIMING.settleMs * 3,
      };
    // Trick-taking vocabulary (@parlour/tricks) — shared by Hearts and friends.
    case 'tricks.play': {
      const playSeat = numberField(event, 'seat');
      return {
        ...base,
        type: 'trick-play',
        card: stringField(event, 'card'),
        seat: playSeat,
        index: numberField(event, 'index'),
        from: `hand:${playSeat}`,
        to: `seat:${playSeat}`,
        durationMs: FX_TIMING.cardFlightMs + FX_TIMING.settleMs,
      };
    }
    case 'tricks.collect':
      return {
        ...base,
        type: 'trick-collect',
        seat: numberField(event, 'seat'),
        count: numberField(event, 'count'),
        durationMs: FX_TIMING.showdownMs,
      };
    // A card passing between hands (secret passes): same flight shape as a
    // deal, but the zones name the two hands involved.
    case 'hearts.transfer':
    case 'wildpile.transfer': {
      const from = zoneField(event, 'from');
      const to = zoneField(event, 'to');
      return {
        ...base,
        type: 'transfer',
        card: stringField(event, 'card'),
        from,
        to,
        durationMs: durationField(event, FX_TIMING.cardFlightMs),
      };
    }
    // Hearts moments ride the shared burst vocabulary.
    case 'hearts.moon':
      return {
        ...base,
        type: 'blitz',
        seat: numberField(event, 'seat'),
        handValue: 26,
        durationMs: FX_TIMING.blitzMs,
      };
    case 'hearts.queen':
      return {
        ...base,
        type: 'knock',
        seat: numberField(event, 'seat'),
        durationMs: FX_TIMING.knockMs,
      };
    case 'hearts.broken':
      return {
        ...base,
        type: 'turn',
        seat: numberField(event, 'seat'),
        durationMs: FX_TIMING.settleMs * 4,
      };
    case 'gin.gin':
    case 'gin.big-gin':
    case 'gin.undercut':
      return {
        ...base,
        type: 'gin-burst',
        burst:
          event.kind === 'gin.gin' ? 'gin' : event.kind === 'gin.big-gin' ? 'big-gin' : 'undercut',
        seat: numberField(event, 'seat'),
        durationMs: event.kind === 'gin.undercut' ? 700 : event.kind === 'gin.big-gin' ? 1100 : 900,
      };
    case 'gin.layoff':
      return {
        ...base,
        type: 'layoff',
        card: stringField(event, 'card'),
        from: zoneField(event, 'from'),
        to: zoneField(event, 'to'),
        durationMs: FX_TIMING.cardFlightMs + FX_TIMING.settleMs,
      };
    default:
      return null;
  }
}

/**
 * One burst of effects is planned four separate times per turn — by the fx
 * layer, by the arrival provider's inbound and outbound passes, and by the deal
 * presentation — always from the same array, always producing the same cues.
 * Planning is pure, so the second through fourth callers can have the first
 * one's answer. Keyed weakly on the array the engine handed us, so a burst that
 * is no longer on screen is not kept alive by having once been animated.
 */
const planned = new WeakMap<readonly FxEvent[], FxCue[]>();

/**
 * Converts engine presentation hints into renderer-ready cues. No game state is
 * inspected here: if the engine did not emit an effect, the table stays still.
 */
export function buildFxTimeline(events: readonly FxEvent[]): FxCue[] {
  const cached = planned.get(events);
  if (cached) return cached;
  const cues = events
    .map(cueFor)
    .filter((cue): cue is FxCue => cue !== null)
    .sort((a, b) => a.startMs - b.startMs);
  planned.set(events, cues);
  return cues;
}

/**
 * When the last cue in a burst finishes. Tables use this to hold the next actor
 * until the current one's cards have actually landed — otherwise a long burst
 * (a stacked pickup, say) is cut off mid-flight by the following move.
 */
export function fxTimelineDurationMs(events: readonly FxEvent[]): number {
  return buildFxTimeline(events).reduce(
    (longest, cue) => Math.max(longest, cue.startMs + cue.durationMs),
    0,
  );
}

/** Human pacing that never advances the table before the current burst settles. */
export function delayUntilFxSettles(
  paceMs: number,
  events: readonly FxEvent[],
  settleMs = 160,
): number {
  return Math.max(paceMs, fxTimelineDurationMs(events) + settleMs);
}
