import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MatchResult } from '@parlour/engine';
import type { GameId } from '@/lib/games';

export const HISTORY_STORAGE_KEY = 'parlour.history.v1';

/** Local-only ledger cap — oldest records fall off so localStorage stays small. */
export const MAX_RECORDS = 400;

export type OpponentKind = 'friend' | 'bot';

/**
 * Stable opponent identity across matches: friends key on the multiplayer
 * profile id (the same UUID seat-reclaim uses), house bots on their persona.
 */
export function friendKey(profileId: string): string {
  return `friend:${profileId}`;
}

export function botKey(personaId: string): string {
  return `bot:${personaId}`;
}

export interface RecordedSeat {
  seat: number;
  name: string;
  avatarId: string;
  kind: OpponentKind;
  key: string;
}

export interface RecordedOpponent {
  key: string;
  name: string;
  avatarId: string;
  kind: OpponentKind;
  /** final rank in the match; 1 = first place, ties share a rank */
  rank: number;
}

export interface MatchRecord {
  id: string;
  /** epoch ms when the match ended */
  at: number;
  game: GameId;
  mode: string;
  localRank: number;
  /** sole or shared first place */
  won: boolean;
  opponents: readonly RecordedOpponent[];
}

/** Pairwise standing against one recurring opponent. */
export interface HeadToHead {
  key: string;
  name: string;
  avatarId: string;
  kind: OpponentKind;
  games: number;
  /** matches where you placed above them */
  wins: number;
  /** matches where they placed above you */
  losses: number;
  ties: number;
  lastPlayedAt: number;
}

function rankOf(result: MatchResult, seat: number): number {
  const rank = result.rankings.find((r) => r.seat === seat)?.rank;
  // a seat missing from the rankings (e.g. a redeal edge) sits below everyone
  return rank ?? result.rankings.length + 1;
}

export function buildMatchRecord(input: {
  id: string;
  at: number;
  game: GameId;
  mode: string;
  result: MatchResult;
  localSeat: number;
  seats: readonly RecordedSeat[];
}): MatchRecord | null {
  const { result, localSeat, seats } = input;
  const local = seats.find((s) => s.seat === localSeat);
  if (!local) return null;
  const localRank = rankOf(result, localSeat);
  const opponents = seats
    .filter((s) => s.seat !== localSeat)
    .map((s) => ({
      key: s.key,
      name: s.name,
      avatarId: s.avatarId,
      kind: s.kind,
      rank: rankOf(result, s.seat),
    }));
  if (opponents.length === 0) return null;
  return {
    id: input.id,
    at: input.at,
    game: input.game,
    mode: input.mode,
    localRank,
    won: localRank === 1,
    opponents,
  };
}

/**
 * Pairwise aggregation: you "beat" an opponent in any match where you ranked
 * above them, whatever the table size — so a 4-seat match counts once against
 * each of the three others, and 1v1 reduces to plain W/L.
 */
export function headToHead(records: readonly MatchRecord[]): HeadToHead[] {
  const rows = new Map<string, HeadToHead>();
  for (const record of records) {
    for (const opponent of record.opponents) {
      const row = rows.get(opponent.key) ?? {
        key: opponent.key,
        name: opponent.name,
        avatarId: opponent.avatarId,
        kind: opponent.kind,
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        lastPlayedAt: 0,
      };
      row.games += 1;
      if (record.localRank < opponent.rank) row.wins += 1;
      else if (record.localRank > opponent.rank) row.losses += 1;
      else row.ties += 1;
      if (record.at >= row.lastPlayedAt) {
        // keep the most recent name/avatar — friends rename themselves
        row.lastPlayedAt = record.at;
        row.name = opponent.name;
        row.avatarId = opponent.avatarId;
      }
      rows.set(opponent.key, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(b.kind === 'friend') - Number(a.kind === 'friend') ||
      b.games - a.games ||
      b.lastPlayedAt - a.lastPlayedAt,
  );
}

export type HistoryState = {
  records: readonly MatchRecord[];
  recordMatch: (record: MatchRecord) => void;
  clearHistory: () => void;
};

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      records: [],
      recordMatch: (record) =>
        set((state) =>
          state.records.some((r) => r.id === record.id)
            ? state
            : { records: [record, ...state.records].slice(0, MAX_RECORDS) },
        ),
      clearHistory: () => set({ records: [] }),
    }),
    {
      name: HISTORY_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ records: state.records }),
    },
  ),
);
