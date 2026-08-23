import { describe, expect, it } from 'vitest';
import { Fx } from '@parlour/engine';
import { MAX_AUTO_NEXT_MS, buildRoundEndPlan, type RoundEndPlan } from './roundEnd';

type FxInput = [kind: string, payload?: unknown, at?: number];

function fxOf(...events: FxInput[]) {
  return events.map(([kind, payload, at]) =>
    at === undefined ? { kind, payload } : { kind, payload, at },
  );
}

describe('buildRoundEndPlan', () => {
  it('returns null when the fx tail has no round.end (overlay must not mount)', () => {
    const plan = buildRoundEndPlan(fxOf([Fx.ShowdownReveal, { seat: 0, handValue: 27 }]));
    expect(plan).toBeNull();
    expect(buildRoundEndPlan([])).toBeNull();
  });

  it('plans a knock round: reveals keep authored order and chips follow the last reveal', () => {
    const plan = buildRoundEndPlan(
      fxOf(
        [Fx.Knock, { seat: 2 }, 0],
        [Fx.ShowdownReveal, { seat: 0, handValue: 24 }, 900],
        [Fx.ShowdownReveal, { seat: 1, handValue: 19 }, 1220],
        [Fx.ShowdownReveal, { seat: 2, handValue: 28 }, 1540],
        [Fx.ChipLoss, { seat: 1, livesLeft: 1 }, 2100],
        [Fx.RoundEnd, { reason: 'knock' }, 2400],
      ),
    ) as RoundEndPlan;

    expect(plan.kind).toBe('knock');
    expect(plan.actorSeat).toBe(2);
    expect(plan.reveals.map((r) => r.seat)).toEqual([0, 1, 2]);
    expect(plan.reveals[0]).toMatchObject({ handValue: 24, atMs: 900 });
    expect(plan.chipLosses).toEqual([{ seat: 1, livesLeft: 1, atMs: 2100 }]);
    expect(plan.bannerAtMs).toBe(1890);
    expect(plan.totalMs).toBe(2500);
    expect(plan.nextReadyAtMs).toBeGreaterThanOrEqual(plan.totalMs);
    expect(plan.nextReadyAtMs).toBeLessThanOrEqual(MAX_AUTO_NEXT_MS);
  });

  it('plans a blitz round with the blitzing seat and 31 as the value', () => {
    const plan = buildRoundEndPlan(
      fxOf(
        [Fx.Blitz, { seat: 3, handValue: 31 }, 0],
        [Fx.ChipLoss, { seat: 0, livesLeft: 2 }, 600],
        [Fx.ChipLoss, { seat: 1, livesLeft: 0 }, 740],
        [Fx.ChipLoss, { seat: 2, livesLeft: 2 }, 880],
        [Fx.RoundEnd, { reason: 'blitz' }, 1200],
      ),
    ) as RoundEndPlan;

    expect(plan.kind).toBe('blitz');
    expect(plan.actorSeat).toBe(3);
    expect(plan.actorHandValue).toBe(31);
    expect(plan.bannerAtMs).toBe(200);
    expect(plan.chipLosses.map((c) => c.seat)).toEqual([0, 1, 2]);
    expect(plan.chipLosses.some((c) => c.livesLeft === 0)).toBe(true);
    expect(plan.endReason).toBe('blitz');
  });

  it('falls back to a showdown banner from reason alone', () => {
    const plan = buildRoundEndPlan(fxOf([Fx.RoundEnd, { reason: 'showdown' }]));
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('showdown');
    expect(plan!.actorSeat).toBeNull();
    expect(plan!.reveals).toEqual([]);
    expect(plan!.bannerAtMs).toBeGreaterThan(0);
  });

  it('assigns deterministic fallback timing when fx omit `at` offsets', () => {
    const plan = buildRoundEndPlan(
      fxOf(
        [Fx.Knock, { seat: 1 }],
        [Fx.ShowdownReveal, { seat: 0, handValue: 20 }],
        [Fx.ShowdownReveal, { seat: 1, handValue: 25 }],
        [Fx.ChipLoss, { seat: 0, livesLeft: 2 }],
        [Fx.RoundEnd, { reason: 'knock' }],
      ),
    ) as RoundEndPlan;

    expect(plan.reveals[0]!.atMs).toBe(320);
    expect(plan.reveals[1]!.atMs).toBe(640);
    expect(plan.chipLosses[0]!.atMs).toBe(780);
    // Deterministic across runs.
    const again = buildRoundEndPlan(
      fxOf(
        [Fx.Knock, { seat: 1 }],
        [Fx.ShowdownReveal, { seat: 0, handValue: 20 }],
        [Fx.ShowdownReveal, { seat: 1, handValue: 25 }],
        [Fx.ChipLoss, { seat: 0, livesLeft: 2 }],
        [Fx.RoundEnd, { reason: 'knock' }],
      ),
    ) as RoundEndPlan;
    expect(again).toEqual(plan);
  });

  it('never lets the auto-deal countdown exceed the 4 s spec cap', () => {
    const longTail = Array.from({ length: 12 }, (_, i) =>
      fxOf([Fx.ShowdownReveal, { seat: i % 4, handValue: 10 + i }, i * 700]),
    ).flat();
    const plan = buildRoundEndPlan([...longTail, ...fxOf([Fx.RoundEnd, { reason: 'knock' }])])!;
    expect(plan.totalMs).toBeGreaterThan(MAX_AUTO_NEXT_MS);
    expect(plan.nextReadyAtMs).toBeLessThanOrEqual(MAX_AUTO_NEXT_MS);
    expect(
      buildRoundEndPlan(fxOf([Fx.RoundEnd, { reason: 'knock' }]), {
        autoNextDelayMs: 99_999,
      })!.nextReadyAtMs,
    ).toBe(MAX_AUTO_NEXT_MS);
  });

  it('clamps negative life values to zero', () => {
    const plan = buildRoundEndPlan(
      fxOf([Fx.ChipLoss, { seat: 2, livesLeft: -3 }, 100], [Fx.RoundEnd, { reason: 'x' }]),
    )!;
    expect(plan.chipLosses[0]!.livesLeft).toBe(0);
  });
});
