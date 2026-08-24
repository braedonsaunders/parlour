import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import {
  botKey,
  buildMatchRecord,
  friendKey,
  headToHead,
  MAX_RECORDS,
  useHistoryStore,
  type MatchRecord,
  type RecordedSeat,
} from './history';

const SEATS: readonly RecordedSeat[] = [
  { seat: 0, name: 'You', avatarId: 'ember', kind: 'friend', key: friendKey('me') },
  { seat: 1, name: 'Gf', avatarId: 'plum', kind: 'friend', key: friendKey('gf-uuid') },
  { seat: 2, name: 'Slate', avatarId: 'slate', kind: 'bot', key: botKey('slate') },
];

function result(ranks: readonly [number, number][]): MatchResult {
  return {
    winner: ranks.find(([, rank]) => rank === 1)?.[0] ?? null,
    rankings: ranks.map(([seat, rank]) => ({ seat, rank })),
    reason: 'test',
  };
}

function record(overrides: Partial<Parameters<typeof buildMatchRecord>[0]> = {}): MatchRecord {
  const built = buildMatchRecord({
    id: overrides.id ?? 'r1',
    at: overrides.at ?? 1000,
    game: 'blitz',
    mode: 'classic',
    result:
      overrides.result ??
      result([
        [0, 1],
        [1, 2],
        [2, 3],
      ]),
    localSeat: 0,
    seats: SEATS,
    ...overrides,
  });
  if (!built) throw new Error('expected a record');
  return built;
}

describe('buildMatchRecord', () => {
  it('captures ranks, win flag and opponents', () => {
    const built = record();
    expect(built.localRank).toBe(1);
    expect(built.won).toBe(true);
    expect(built.opponents.map((o) => [o.key, o.rank])).toEqual([
      [friendKey('gf-uuid'), 2],
      [botKey('slate'), 3],
    ]);
  });

  it('marks a shared first place as a win', () => {
    const built = record({
      result: result([
        [0, 1],
        [1, 1],
        [2, 3],
      ]),
    });
    expect(built.won).toBe(true);
    expect(built.localRank).toBe(1);
  });

  it('returns null without a local seat or opponents', () => {
    expect(
      buildMatchRecord({
        id: 'x',
        at: 1,
        game: 'blitz',
        mode: 'classic',
        result: result([[0, 1]]),
        localSeat: 5,
        seats: SEATS,
      }),
    ).toBeNull();
  });
});

describe('headToHead', () => {
  it('aggregates pairwise wins, losses and ties per opponent', () => {
    const records = [
      // you 1st, gf 2nd → win vs gf, win vs bot
      record({ id: 'a', at: 1 }),
      // gf 1st, you 2nd → loss vs gf, win vs bot
      record({
        id: 'b',
        at: 2,
        result: result([
          [0, 2],
          [1, 1],
          [2, 3],
        ]),
      }),
      // tie with gf, both behind the bot
      record({
        id: 'c',
        at: 3,
        result: result([
          [0, 2],
          [1, 2],
          [2, 1],
        ]),
      }),
    ];
    const rows = headToHead(records);
    const gf = rows.find((r) => r.key === friendKey('gf-uuid'));
    expect(gf).toMatchObject({ games: 3, wins: 1, losses: 1, ties: 1, kind: 'friend' });
    const bot = rows.find((r) => r.key === botKey('slate'));
    expect(bot).toMatchObject({ games: 3, wins: 2, losses: 1, ties: 0, kind: 'bot' });
    // friends sort before bots regardless of volume
    expect(rows[0]?.kind).toBe('friend');
  });

  it('keeps the most recent name and avatar for a renamed friend', () => {
    const renamed: readonly RecordedSeat[] = [
      SEATS[0]!,
      { ...SEATS[1]!, name: 'Gf ♥', avatarId: 'mint' },
      SEATS[2]!,
    ];
    const rows = headToHead([
      record({ id: 'a', at: 1 }),
      record({ id: 'b', at: 9, seats: renamed }),
    ]);
    const gf = rows.find((r) => r.key === friendKey('gf-uuid'));
    expect(gf?.name).toBe('Gf ♥');
    expect(gf?.avatarId).toBe('mint');
  });
});

describe('useHistoryStore', () => {
  beforeEach(() => {
    useHistoryStore.getState().clearHistory();
  });

  it('prepends records, dedupes by id and trims to the cap', () => {
    const { recordMatch } = useHistoryStore.getState();
    recordMatch(record({ id: 'dup' }));
    recordMatch(record({ id: 'dup' }));
    expect(useHistoryStore.getState().records).toHaveLength(1);

    for (let i = 0; i < MAX_RECORDS + 10; i++) recordMatch(record({ id: `r${i}`, at: i }));
    const records = useHistoryStore.getState().records;
    expect(records).toHaveLength(MAX_RECORDS);
    expect(records[0]?.id).toBe(`r${MAX_RECORDS + 9}`);
  });
});
