import { type FxEvent } from '@parlour/engine';

/**
 * Spades-specific presentation cues. The shared table timeline
 * (lib/table/fx-motion.ts) already renders deal flights, turn rings and the
 * neutral `tricks.*` play/collect pair; this builder maps only the namespaced
 * `spades.*` moments on top of it.
 */

export const SPADES_TIMING = {
  bidPopMs: 420,
  bannerMs: 680,
  collectMs: 420,
  scorePopMs: 520,
  sheetMs: 1_400,
} as const;

type BaseCue = {
  id: string;
  startMs: number;
  durationMs: number;
};

export interface HandScoreTeamCue {
  team: number;
  contract: number;
  nonNilTricks: number;
  made: boolean;
  delta: number;
  bagsTaken: number;
  bagPenalty: number;
  total: number;
  bags: number;
}

export type SpadesCue =
  | (BaseCue & { type: 'bid'; seat: number; bid: number | null; nil: boolean })
  | (BaseCue & { type: 'bids-complete'; contracts: readonly number[] })
  | (BaseCue & { type: 'trick-collect'; winner: number; cards: readonly string[] })
  | (BaseCue & { type: 'spades-broken'; seat: number; card: string | null })
  | (BaseCue & { type: 'nil-made'; seat: number })
  | (BaseCue & { type: 'nil-failed'; seat: number })
  | (BaseCue & {
      type: 'hand-score';
      handNo: number;
      /** One entry per partnership, in team order — the engine emits a single event. */
      teams: readonly HandScoreTeamCue[];
    })
  | (BaseCue & { type: 'bag-penalty'; team: number; penalty: number; bags: number })
  | (BaseCue & { type: 'score-chip'; team: number; total: number; delta: number });

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

function numberList(payload: Record<string, unknown>, key: string): readonly number[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === 'number');
}

function handScoreTeams(payload: Record<string, unknown>): HandScoreTeamCue[] {
  const raw = payload.teams;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const team = entry as Record<string, unknown>;
    const index = num(team, 'team');
    if (index === null) return [];
    return [
      {
        team: index,
        contract: num(team, 'contract') ?? 0,
        nonNilTricks: num(team, 'nonNilTricks') ?? 0,
        made: team.made === true,
        delta: num(team, 'delta') ?? 0,
        bagsTaken: num(team, 'bagsTaken') ?? 0,
        bagPenalty: num(team, 'bagPenalty') ?? 0,
        total: num(team, 'total') ?? 0,
        bags: num(team, 'bags') ?? 0,
      },
    ];
  });
}

function cueFor(event: FxEvent, index: number): SpadesCue | null {
  const base = {
    id: `${index}:${event.kind}`,
    startMs: Math.max(0, event.at ?? 0),
  };
  const payload = payloadRecord(event);

  switch (event.kind) {
    case 'spades.bid': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      const nil = payload.nil === true;
      return {
        ...base,
        type: 'bid',
        seat,
        bid: nil ? null : (num(payload, 'bid') ?? num(payload, 'tricks')),
        nil,
        durationMs: SPADES_TIMING.bidPopMs,
      };
    }
    case 'spades.bids-complete':
      return {
        ...base,
        type: 'bids-complete',
        contracts: numberList(payload, 'contracts'),
        durationMs: SPADES_TIMING.bannerMs,
      };
    case 'spades.trick-collect': {
      const winner = num(payload, 'winner') ?? num(payload, 'seat');
      if (winner === null) return null;
      const cards = Array.isArray(payload.cards) ? (payload.cards as string[]) : [];
      return {
        ...base,
        type: 'trick-collect',
        winner,
        cards,
        durationMs: SPADES_TIMING.collectMs,
      };
    }
    case 'spades.spades-broken': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      return {
        ...base,
        type: 'spades-broken',
        seat,
        card: str(payload, 'card'),
        durationMs: SPADES_TIMING.bannerMs,
      };
    }
    case 'spades.nil-made':
    case 'spades.nil-failed': {
      const seat = num(payload, 'seat');
      if (seat === null) return null;
      return {
        ...base,
        type: event.kind === 'spades.nil-made' ? 'nil-made' : 'nil-failed',
        seat,
        durationMs: SPADES_TIMING.bannerMs,
      };
    }
    case 'spades.hand-score': {
      const teams = handScoreTeams(payload);
      if (teams.length === 0) return null;
      return {
        ...base,
        type: 'hand-score',
        handNo: num(payload, 'handNo') ?? 0,
        teams,
        durationMs: SPADES_TIMING.sheetMs,
      };
    }
    case 'spades.bag-penalty': {
      const team = num(payload, 'team');
      if (team === null) return null;
      return {
        ...base,
        type: 'bag-penalty',
        team,
        penalty: num(payload, 'penalty') ?? 0,
        bags: num(payload, 'bags') ?? 0,
        durationMs: SPADES_TIMING.bannerMs,
      };
    }
    case 'spades.score-chip': {
      const team = num(payload, 'team');
      if (team === null) return null;
      return {
        ...base,
        type: 'score-chip',
        team,
        total: num(payload, 'total') ?? 0,
        delta: num(payload, 'delta') ?? 0,
        durationMs: SPADES_TIMING.scorePopMs,
      };
    }
    default:
      return null;
  }
}

/** Converts Spades fx hints into renderer-ready cues; unknown kinds are skipped. */
export function buildSpadesTimeline(events: readonly FxEvent[]): SpadesCue[] {
  return events
    .map(cueFor)
    .filter((cue): cue is SpadesCue => cue !== null)
    .sort((a, b) => a.startMs - b.startMs);
}
