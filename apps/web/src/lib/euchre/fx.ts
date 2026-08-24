import { type FxEvent } from '@parlour/engine';

/**
 * Euchre-specific presentation cues. The shared table timeline
 * (lib/table/fx-motion.ts) already renders deal flights, kitty flips and turn
 * rings; this builder maps only the namespaced euchre moments on top of it.
 */

export const EUCHRE_TIMING = {
  trickFlightMs: 190,
  collectMs: 420,
  bannerMs: 640,
  scorePopMs: 520,
} as const;

type BaseCue = {
  id: string;
  startMs: number;
  durationMs: number;
};

export type EuchreCue =
  | (BaseCue & { type: 'trick-play'; card: string; seat: number })
  | (BaseCue & { type: 'trick-collect'; winner: number; cards: readonly string[] })
  | (BaseCue & {
      type: 'call';
      seat: number;
      suit: string | null;
      round: number;
      alone: boolean;
    })
  | (BaseCue & { type: 'pass'; seat: number })
  | (BaseCue & { type: 'pickup'; dealer: number })
  | (BaseCue & { type: 'turn-down'; card: string })
  | (BaseCue & {
      type: 'hand-score';
      reason: string;
      points: number;
      makerTeam: number;
    })
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

function cueFor(event: FxEvent, index: number): EuchreCue | null {
  const base = {
    id: `${index}:${event.kind}`,
    startMs: Math.max(0, event.at ?? 0),
  };
  const payload = payloadRecord(event);

  switch (event.kind) {
    case 'euchre.trick-play': {
      const seat = num(payload, 'seat');
      const card = str(payload, 'card');
      if (seat === null || !card) return null;
      return { ...base, type: 'trick-play', card, seat, durationMs: EUCHRE_TIMING.trickFlightMs };
    }
    case 'euchre.trick-collect': {
      const winner = num(payload, 'winner');
      if (winner === null) return null;
      const cards = Array.isArray(payload.cards) ? (payload.cards as string[]) : [];
      return { ...base, type: 'trick-collect', winner, cards, durationMs: EUCHRE_TIMING.collectMs };
    }
    case 'euchre.call': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      return {
        ...base,
        type: 'call',
        seat,
        suit: str(payload, 'suit'),
        round: num(payload, 'round') ?? 1,
        alone: bool(payload, 'alone'),
        durationMs: EUCHRE_TIMING.bannerMs,
      };
    }
    case 'euchre.bid-pass': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      return { ...base, type: 'pass', seat, durationMs: EUCHRE_TIMING.bannerMs * 0.6 };
    }
    case 'euchre.pickup':
    case 'euchre.turn-down': {
      const seat = num(payload, 'dealer') ?? num(payload, 'seat');
      if (!str(payload, 'card') && !str(payload, 'picked') && seat === null) return null;
      return {
        ...base,
        ...(event.kind === 'euchre.pickup'
          ? { type: 'pickup', dealer: seat ?? 0 }
          : { type: 'turn-down', card: str(payload, 'card') ?? '' }),
        durationMs: EUCHRE_TIMING.bannerMs,
      } as EuchreCue;
    }
    case 'euchre.hand-score': {
      const reason = str(payload, 'reason');
      if (!reason) return null;
      return {
        ...base,
        type: 'hand-score',
        reason,
        points: num(payload, 'points') ?? 0,
        makerTeam: num(payload, 'makerTeam') ?? 0,
        durationMs: EUCHRE_TIMING.bannerMs,
      };
    }
    case 'euchre.score-chip': {
      const team = num(payload, 'team');
      if (team === null) return null;
      return {
        ...base,
        type: 'score-chip',
        team,
        total: num(payload, 'total') ?? 0,
        durationMs: EUCHRE_TIMING.scorePopMs,
      };
    }
    default:
      return null;
  }
}

/** Converts euchre fx hints into renderer-ready cues; unknown kinds are skipped. */
export function buildEuchreTimeline(events: readonly FxEvent[]): EuchreCue[] {
  return events
    .map(cueFor)
    .filter((cue): cue is EuchreCue => cue !== null)
    .sort((a, b) => a.startMs - b.startMs);
}
