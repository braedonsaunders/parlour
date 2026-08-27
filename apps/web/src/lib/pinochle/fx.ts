import { type FxEvent } from '@parlour/engine';

/**
 * Pinochle-specific presentation cues. The shared table timeline
 * (lib/table/fx-motion.ts) already renders deal flights, turn rings, and the
 * shared trick vocabulary (`tricks.play`/`tricks.collect` — this pack uses
 * those directly, unlike Euchre); this builder maps only the namespaced
 * pinochle moments on top of it: the auction, naming trump, melding and the
 * hand's made/set verdict.
 */

export const PINOCHLE_TIMING = {
  popMs: 420,
  bannerMs: 700,
  meldMs: 820,
  scorePopMs: 520,
} as const;

type BaseCue = {
  id: string;
  startMs: number;
  durationMs: number;
};

export type PinochleCue =
  | (BaseCue & { type: 'bid'; seat: number; bid: number | null })
  | (BaseCue & { type: 'auction-won'; seat: number; team: number; bid: number })
  | (BaseCue & { type: 'trump'; seat: number; team: number; suit: string })
  | (BaseCue & { type: 'meld'; seat: number; team: number; total: number })
  | (BaseCue & { type: 'hand-score'; set: boolean; bidTeam: number; bid: number })
  | (BaseCue & { type: 'score-chip'; team: number; total: number });

function payloadRecord(event: FxEvent): Record<string, unknown> {
  return (event.payload as Record<string, unknown> | undefined) ?? {};
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function cueFor(event: FxEvent, index: number): PinochleCue | null {
  const base = {
    id: `${index}:${event.kind}`,
    startMs: Math.max(0, event.at ?? 0),
  };
  const payload = payloadRecord(event);

  switch (event.kind) {
    case 'pinochle.bid': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      return {
        ...base,
        type: 'bid',
        seat,
        bid: num(payload, 'bid'),
        durationMs: PINOCHLE_TIMING.popMs,
      };
    }
    case 'pinochle.auction-won': {
      const seat = num(payload, 'seat');
      const bid = num(payload, 'bid');
      if (seat === null || bid === null) return null;
      return {
        ...base,
        type: 'auction-won',
        seat,
        team: num(payload, 'team') ?? seat % 2,
        bid,
        durationMs: PINOCHLE_TIMING.bannerMs,
      };
    }
    case 'pinochle.trump': {
      const seat = num(payload, 'seat');
      const suit = str(payload, 'suit');
      if (seat === null || !suit) return null;
      return {
        ...base,
        type: 'trump',
        seat,
        team: num(payload, 'team') ?? seat % 2,
        suit,
        durationMs: PINOCHLE_TIMING.bannerMs,
      };
    }
    case 'pinochle.meld': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      const breakdown = payload.breakdown as Record<string, unknown> | undefined;
      const total = breakdown && typeof breakdown.total === 'number' ? breakdown.total : 0;
      return {
        ...base,
        type: 'meld',
        seat,
        team: num(payload, 'team') ?? seat % 2,
        total,
        durationMs: PINOCHLE_TIMING.meldMs,
      };
    }
    case 'pinochle.hand-score': {
      const bidTeam = num(payload, 'bidTeam');
      const bid = num(payload, 'bid');
      if (bidTeam === null || bid === null) return null;
      return {
        ...base,
        type: 'hand-score',
        set: bool(payload, 'set'),
        bidTeam,
        bid,
        durationMs: PINOCHLE_TIMING.bannerMs,
      };
    }
    case 'pinochle.score-chip': {
      const team = num(payload, 'team');
      if (team === null) return null;
      return {
        ...base,
        type: 'score-chip',
        team,
        total: num(payload, 'total') ?? 0,
        durationMs: PINOCHLE_TIMING.scorePopMs,
      };
    }
    default:
      return null;
  }
}

/** Converts pinochle fx hints into renderer-ready cues; unknown kinds are skipped. */
export function buildPinochleTimeline(events: readonly FxEvent[]): PinochleCue[] {
  return events
    .map(cueFor)
    .filter((cue): cue is PinochleCue => cue !== null)
    .sort((a, b) => a.startMs - b.startMs);
}
