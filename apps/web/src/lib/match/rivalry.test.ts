import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import { botKey, buildMatchRecord, friendKey, type MatchRecord } from '@/stores/history';
import { deriveRivalry, hasRivalryToShow, scoreline, startOfLocalDay } from './rivalry';
import type { GameId } from '@/lib/games';

const ME = friendKey('me');
const GF = friendKey('gf-uuid');
const SLATE = botKey('slate');

const DUEL_SEATS = [
  { seat: 0, name: 'You', avatarId: 'ember', kind: 'friend' as const, key: ME },
  { seat: 1, name: 'Gf', avatarId: 'plum', kind: 'friend' as const, key: GF },
];

const TABLE_SEATS = [
  ...DUEL_SEATS,
  { seat: 2, name: 'Slate', avatarId: 'slate', kind: 'bot' as const, key: SLATE },
];

/** Local-time anchors, so the day boundary is the one the player would see. */
const TODAY = new Date(2026, 8, 15, 20, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const YESTERDAY = TODAY - 24 * HOUR;

function result(ranks: readonly (readonly [number, number])[]): MatchResult {
  return {
    winner: ranks.find(([, rank]) => rank === 1)?.[0] ?? null,
    rankings: ranks.map(([seat, rank]) => ({ seat, rank })),
    reason: 'test',
  };
}

function match(options: {
  id: string;
  at: number;
  localRank: 1 | 2;
  game?: GameId;
  seats?: typeof TABLE_SEATS;
}): MatchRecord {
  const seats = options.seats ?? DUEL_SEATS;
  const others = seats.slice(1).map((seat, index): readonly [number, number] => {
    // the local seat either tops the table or sits below everyone else
    return [seat.seat, options.localRank === 1 ? index + 2 : index + 1];
  });
  const built = buildMatchRecord({
    id: options.id,
    at: options.at,
    game: options.game ?? 'blitz',
    mode: 'classic',
    result: result([[0, options.localRank === 1 ? 1 : seats.length], ...others]),
    localSeat: 0,
    seats,
  });
  if (!built) throw new Error('expected a record');
  return built;
}

// newest first, the order the history store keeps
function ledger(...records: MatchRecord[]): MatchRecord[] {
  return [...records].sort((a, b) => b.at - a.at);
}

describe('startOfLocalDay', () => {
  it('lands on the player’s own midnight', () => {
    const midnight = new Date(startOfLocalDay(TODAY));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getDate()).toBe(new Date(TODAY).getDate());
  });
});

describe('deriveRivalry', () => {
  it('returns nothing without any history', () => {
    expect(deriveRivalry([])).toBeNull();
  });

  it('counts every match played against this table today', () => {
    const records = ledger(
      match({ id: 'a', at: TODAY - 3 * HOUR, localRank: 1 }),
      match({ id: 'b', at: TODAY - 2 * HOUR, localRank: 1 }),
      match({ id: 'c', at: TODAY - HOUR, localRank: 2 }),
      match({ id: 'd', at: TODAY, localRank: 1 }),
    );

    const rivalry = deriveRivalry(records, 'd');

    expect(rivalry?.todayGames).toBe(4);
    expect(rivalry?.duel).toBe(true);
    expect(rivalry?.standings[0]).toMatchObject({
      key: GF,
      today: { games: 4, wins: 3, losses: 1, ties: 0 },
      allTime: { games: 4, wins: 3, losses: 1, ties: 0 },
    });
  });

  it('leaves yesterday out of today and keeps it in all time', () => {
    const records = ledger(
      match({ id: 'old-1', at: YESTERDAY, localRank: 2 }),
      match({ id: 'old-2', at: YESTERDAY + HOUR, localRank: 2 }),
      match({ id: 'now', at: TODAY, localRank: 1 }),
    );

    const rivalry = deriveRivalry(records, 'now');

    expect(rivalry?.todayGames).toBe(1);
    expect(rivalry?.standings[0]?.today).toMatchObject({ games: 1, wins: 1, losses: 0 });
    expect(rivalry?.standings[0]?.allTime).toMatchObject({ games: 3, wins: 1, losses: 2 });
  });

  /**
   * The bug this whole model replaces: an evening's score is not allowed to
   * reset because the two of you dealt a different game in between. The old
   * "sitting" broke on exactly that and the headline jumped from 17–9 to 0–2.
   */
  it('keeps one running score across the different games played today', () => {
    const records = ledger(
      match({ id: 'blitz-1', at: TODAY - 3 * HOUR, localRank: 1 }),
      match({ id: 'wild-1', at: TODAY - 2 * HOUR, localRank: 1, game: 'wild' }),
      match({ id: 'blitz-2', at: TODAY - HOUR, localRank: 2 }),
      match({ id: 'wild-2', at: TODAY, localRank: 1, game: 'wild' }),
    );

    const rivalry = deriveRivalry(records, 'wild-2');

    expect(rivalry?.game).toBe('wild');
    expect(rivalry?.todayGames).toBe(4);
    expect(rivalry?.standings[0]?.today).toMatchObject({ games: 4, wins: 3, losses: 1 });
  });

  it('counts today against this table, not against a different one', () => {
    const records = ledger(
      match({ id: 'three-handed', at: TODAY - HOUR, localRank: 1, seats: TABLE_SEATS }),
      match({ id: 'heads-up', at: TODAY, localRank: 1 }),
    );

    const rivalry = deriveRivalry(records, 'heads-up');

    // one of today's two matches was a three-hander; this table played once
    expect(rivalry?.todayGames).toBe(1);
    expect(rivalry?.standings).toHaveLength(1);
    // the shared opponent still carries both, today and all time
    expect(rivalry?.standings[0]?.today.games).toBe(2);
    expect(rivalry?.standings[0]?.allTime.games).toBe(2);
  });

  it('stands up a row per opponent at a fuller table, bots included', () => {
    const records = ledger(
      match({ id: 'a', at: TODAY - HOUR, localRank: 2, seats: TABLE_SEATS }),
      match({ id: 'b', at: TODAY, localRank: 1, seats: TABLE_SEATS }),
    );

    const rivalry = deriveRivalry(records, 'b');

    expect(rivalry?.duel).toBe(false);
    expect(rivalry?.standings.map((standing) => standing.key)).toEqual([GF, SLATE]);
    expect(rivalry?.standings[1]).toMatchObject({ kind: 'bot', today: { games: 2, wins: 1 } });
  });

  it('anchors on the most recent match when no id is given', () => {
    const records = ledger(
      match({ id: 'a', at: TODAY - HOUR, localRank: 1 }),
      match({ id: 'b', at: TODAY, localRank: 1 }),
    );
    expect(deriveRivalry(records)?.todayGames).toBe(2);
  });

  it('returns nothing when the anchor is not in the ledger', () => {
    expect(
      deriveRivalry(ledger(match({ id: 'a', at: TODAY, localRank: 1 })), 'missing'),
    ).toBeNull();
  });
});

describe('hasRivalryToShow', () => {
  it('stays hidden after a one-off first meeting', () => {
    const records = ledger(match({ id: 'a', at: TODAY, localRank: 1 }));
    expect(hasRivalryToShow(deriveRivalry(records, 'a'))).toBe(false);
  });

  it('shows once the same faces have played twice today', () => {
    const records = ledger(
      match({ id: 'a', at: TODAY - HOUR, localRank: 1 }),
      match({ id: 'b', at: TODAY, localRank: 2 }),
    );
    expect(hasRivalryToShow(deriveRivalry(records, 'b'))).toBe(true);
  });

  it('shows an all-time record even on the first game of the day', () => {
    const records = ledger(
      match({ id: 'a', at: YESTERDAY, localRank: 1 }),
      match({ id: 'b', at: TODAY, localRank: 2 }),
    );
    const rivalry = deriveRivalry(records, 'b');
    expect(rivalry?.todayGames).toBe(1);
    expect(hasRivalryToShow(rivalry)).toBe(true);
  });
});

describe('scoreline', () => {
  it('drops ties until there are some', () => {
    expect(scoreline({ games: 5, wins: 3, losses: 2, ties: 0 })).toBe('3–2');
    expect(scoreline({ games: 5, wins: 3, losses: 1, ties: 1 })).toBe('3–1–1');
  });
});
