import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@parlour/engine';
import { derivePodium } from './podium';
import type { SeatInfo } from '@/lib/seats';

const SEATS: readonly SeatInfo[] = [
  { seat: 0, name: 'Braedon', avatarId: 'ember' },
  { seat: 1, name: '', avatarId: 'juniper' },
  { seat: 2, name: 'Ada', avatarId: 'cobalt' },
];

function result(partial: Partial<MatchResult>): MatchResult {
  return { winner: null, rankings: [], reason: 'match-complete', ...partial };
}

describe('derivePodium', () => {
  it('orders plaques by rank and flags the winner', () => {
    const podium = derivePodium(
      result({
        winner: 2,
        reason: 'last-one-standing',
        rankings: [
          { seat: 1, rank: 3 },
          { seat: 2, rank: 1 },
          { seat: 0, rank: 2 },
        ],
      }),
      SEATS,
    );

    expect(podium.map((p) => p.seat)).toEqual([2, 0, 1]);
    expect(podium[0]).toMatchObject({ isWinner: true, rank: 1, name: 'Ada' });
    expect(podium[1]!.isWinner).toBe(false);
    expect(podium[2]!.isWinner).toBe(false);
  });

  it('falls back to the persona name when the profile name is blank', () => {
    const podium = derivePodium(result({ rankings: [{ seat: 1, rank: 1 }] }), SEATS);
    expect(podium[0]!.name).toBe('Juniper');
  });

  it('extracts stat details with safe zero defaults', () => {
    const podium = derivePodium(
      result({
        winner: 0,
        rankings: [
          {
            seat: 0,
            rank: 1,
            detail: { blitzes: 2, knockWins: 'nope' as never },
          },
          { seat: 1, rank: 2 },
        ],
      }),
      SEATS,
    );
    expect(podium[0]).toMatchObject({ blitzes: 2, knockWins: 0 });
    expect(podium[1]).toMatchObject({ blitzes: 0, knockWins: 0, livesLeft: null });
  });

  it('keeps livesLeft only when numeric (fast mode has no lives)', () => {
    const podium = derivePodium(
      result({
        rankings: [
          { seat: 0, rank: 1, detail: { livesLeft: 2 } },
          { seat: 1, rank: 2, detail: { livesLeft: 0 } },
        ],
      }),
      SEATS,
    );
    expect(podium.map((p) => p.livesLeft)).toEqual([2, 0]);
  });

  it('drops rankings for unknown seats instead of inventing players', () => {
    const podium = derivePodium(
      result({
        winner: 9,
        rankings: [
          { seat: 9, rank: 1 },
          { seat: 2, rank: 2 },
        ],
      }),
      SEATS,
    );
    expect(podium).toHaveLength(1);
    expect(podium[0]).toMatchObject({ seat: 2, isWinner: false });
  });

  it('breaks rank ties deterministically by seat', () => {
    const podium = derivePodium(
      result({
        rankings: [
          { seat: 2, rank: 1 },
          { seat: 0, rank: 1 },
        ],
      }),
      SEATS,
    );
    expect(podium.map((p) => p.seat)).toEqual([0, 2]);
  });

  it('handles an empty rankings list', () => {
    expect(derivePodium(result({}), SEATS)).toEqual([]);
  });
});
