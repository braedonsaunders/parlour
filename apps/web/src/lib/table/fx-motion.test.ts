import { Fx, type FxEvent } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { botTurnDelayMs, buildFxTimeline, FX_TIMING, tableHandoffDelayMs } from './fx-motion';

describe('table fx timeline', () => {
  it('turns unordered engine fx into a stable choreography for every table moment', () => {
    const events: FxEvent[] = [
      { kind: Fx.ShowdownReveal, payload: { seat: 2, handValue: 18 }, at: 600 },
      { kind: Fx.Blitz, payload: { seat: 1, handValue: 31 }, at: 420 },
      { kind: Fx.DealCard, payload: { card: 'HA', from: 'stock', to: 'hand:0' }, at: 0 },
      { kind: Fx.DealCard, payload: { card: 'D7', from: 'stock', to: 'hand:1' }, at: 70 },
      { kind: Fx.DrawCard, payload: { card: 'S9', seat: 0, from: 'stock' }, at: 210 },
      { kind: Fx.DiscardCard, payload: { card: 'C4', seat: 0, to: 'discard' }, at: 260 },
      { kind: Fx.Knock, payload: { seat: 3 }, at: 310 },
    ];

    const timeline = buildFxTimeline(events);

    expect(timeline.map(({ type }) => type)).toEqual([
      'deal',
      'deal',
      'draw',
      'discard',
      'knock',
      'blitz',
      'showdown',
    ]);
    expect(timeline.map(({ startMs }) => startMs)).toEqual([0, 70, 210, 260, 310, 420, 600]);
    expect(
      timeline.filter(({ type }) => type === 'deal').map(({ durationMs }) => durationMs),
    ).toEqual([FX_TIMING.dealFlightMs, FX_TIMING.dealFlightMs]);
    expect(FX_TIMING.dealFlightMs).toBeGreaterThan(FX_TIMING.cardFlightMs);
    expect(timeline.every(({ durationMs }) => durationMs <= FX_TIMING.maxBurstMs)).toBe(true);
  });

  it('rejects malformed presentation hints instead of animating a false destination', () => {
    expect(() =>
      buildFxTimeline([{ kind: Fx.DrawCard, payload: { card: 'S9', from: 'stock' } }]),
    ).toThrow(/card.draw.*seat/i);
  });

  it('preserves equal-time engine ordering', () => {
    const timeline = buildFxTimeline([
      { kind: Fx.Knock, payload: { seat: 0 }, at: 10 },
      { kind: Fx.Blitz, payload: { seat: 1, handValue: 31 }, at: 10 },
    ]);

    expect(timeline.map(({ type }) => type)).toEqual(['knock', 'blitz']);
  });

  it('turns the setup starter flip into a face-up stock-to-discard flight', () => {
    const [flip] = buildFxTimeline([
      {
        kind: Fx.FlipCard,
        payload: { card: 'D3', from: 'stock', to: 'discard', dur: 220 },
        at: 840,
      },
    ]);

    expect(flip).toMatchObject({
      type: 'flip',
      card: 'D3',
      from: 'stock',
      to: 'discard',
      startMs: 840,
      durationMs: 220,
    });
  });

  it('lets a game direct a played card to its table-specific peg pile', () => {
    const [discard] = buildFxTimeline([
      { kind: Fx.DiscardCard, payload: { card: 'H5', seat: 1, to: 'peg' } },
    ]);

    expect(discard).toMatchObject({ type: 'discard', from: 'hand:1', to: 'peg' });
  });

  it('maps Wild hand exchanges onto the shared transfer flight', () => {
    const [transfer] = buildFxTimeline([
      {
        kind: 'wildpile.transfer',
        payload: { card: 'red-7-0', from: 'hand:0', to: 'hand:2', dur: 240 },
        at: 62,
      },
    ]);

    expect(transfer).toMatchObject({
      type: 'transfer',
      card: 'red-7-0',
      from: 'hand:0',
      to: 'hand:2',
      startMs: 62,
      durationMs: 240,
    });
  });

  it('adds the shared human read beat after the last card has landed', () => {
    const events: FxEvent[] = [
      { kind: Fx.DiscardCard, payload: { card: 'H5', seat: 0, to: 'discard' } },
    ];

    expect(tableHandoffDelayMs('casual', events)).toBe(860);
    expect(tableHandoffDelayMs('casual', [])).toBe(600);
  });

  it('uses one shared cadence for bot thought and visual handoff', () => {
    const input = { mode: 'casual' as const, seed: 9, turn: 4, seat: 2 };
    const delay = botTurnDelayMs(input, []);

    expect(delay).toBeGreaterThanOrEqual(600);
    expect(delay).toBeLessThanOrEqual(840);
    expect(botTurnDelayMs(input, [])).toBe(delay);
  });

  it('keeps explicitly timed tables fast without bypassing their visual burst', () => {
    const input = { mode: 'timed' as const, seed: 9, turn: 4, seat: 2 };
    const events: FxEvent[] = [
      { kind: Fx.DrawCard, payload: { card: 'C8', seat: 2, from: 'stock' } },
    ];
    const delay = botTurnDelayMs(input, events);

    expect(delay).toBeGreaterThanOrEqual(FX_TIMING.drawFlightMs + 100);
    expect(delay).toBeLessThanOrEqual(FX_TIMING.drawFlightMs + 140);
  });
});
