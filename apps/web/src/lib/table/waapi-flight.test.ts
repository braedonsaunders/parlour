import { gsap } from 'gsap';
import { describe, expect, it, vi } from 'vitest';
import {
  POWER2_IN,
  POWER2_OUT,
  SINE_IN_OUT,
  gsapPower2In,
  gsapPower2InOut,
  gsapPower2Out,
} from './waapi-eases';
import {
  cancelWaapiAnimations,
  isCardFlightCue,
  planCardFlight,
  playCardFlight,
  type CardFlightSpec,
} from './waapi-flight';
import type { FxCue } from './fx-motion';

const land: CardFlightSpec = {
  startMs: 80,
  flightDuration: 0.2,
  settleDuration: 0.08,
  fromX: 100,
  fromY: 400,
  toX: 300,
  toY: 200,
  arcPeak: 120,
  takeoffRotate: -7,
  landingRotation: 2,
  landingScale: 1,
  handoff: false,
  flip: false,
};

const handoff: CardFlightSpec = {
  ...land,
  landingScale: 0.85,
  landingRotation: -4,
  handoff: true,
};

function layer(plan: ReturnType<typeof planCardFlight>, name: string, index = 0) {
  return plan.filter((step) => step.layer === name)[index];
}

function transformAt(frames: Keyframe[], offset: number): string {
  const match = frames.find((frame) => frame.offset === offset);
  expect(match, `missing offset ${offset}`).toBeTruthy();
  return String(match?.transform);
}

function px(transform: string): number {
  const match = /[-+]?\d*\.?\d+/.exec(transform);
  expect(match).toBeTruthy();
  return Number(match?.[0]);
}

function gsapX(spec: CardFlightSpec, t: number): number {
  return spec.fromX + (spec.toX - spec.fromX) * gsapPower2InOut(t);
}

function gsapY(spec: CardFlightSpec, t: number): number {
  if (t <= 0.48) {
    return spec.fromY + (spec.arcPeak - spec.fromY) * gsapPower2Out(t / 0.48);
  }
  const local = (t - 0.48) / 0.52;
  const eased = spec.handoff ? gsapPower2InOut(local) : gsapPower2In(local);
  return spec.arcPeak + (spec.toY - spec.arcPeak) * eased;
}

describe('isCardFlightCue', () => {
  it('selects only the compositor-bound flight types', () => {
    const types: Array<FxCue['type']> = [
      'deal',
      'flip',
      'draw',
      'discard',
      'trick-play',
      'transfer',
      'layoff',
      'knock',
      'blitz',
      'gin-burst',
      'showdown',
    ];
    expect(types.filter((type) => isCardFlightCue({ type } as FxCue))).toEqual([
      'deal',
      'flip',
      'draw',
      'discard',
      'trick-play',
      'transfer',
      'layoff',
    ]);
  });
});

describe('planCardFlight', () => {
  it('splits x onto power2.inOut halves and y onto the 48/52 arc', () => {
    const x = layer(planCardFlight(land), 'element', 0);
    const y = layer(planCardFlight(land), 'element', 1);
    expect(x?.options.composite).toBe('add');
    expect(y?.options.composite).toBe('add');
    expect(x?.options.delay).toBe(80);
    expect(x?.options.duration).toBe(200);
    expect(x?.options.fill).toBe('forwards');

    expect(px(transformAt(x!.keyframes, 0))).toBeCloseTo(gsapX(land, 0), 10);
    expect(px(transformAt(x!.keyframes, 0.5))).toBeCloseTo(gsapX(land, 0.5), 10);
    expect(px(transformAt(x!.keyframes, 1))).toBeCloseTo(gsapX(land, 1), 10);
    expect(x!.keyframes[0]?.easing).toBe(POWER2_IN);
    expect(x!.keyframes[1]?.easing).toBe(POWER2_OUT);

    expect(px(transformAt(y!.keyframes, 0))).toBeCloseTo(gsapY(land, 0), 10);
    expect(px(transformAt(y!.keyframes, 0.48))).toBeCloseTo(gsapY(land, 0.48), 10);
    expect(px(transformAt(y!.keyframes, 1))).toBeCloseTo(gsapY(land, 1), 10);
    expect(y!.keyframes[0]?.easing).toBe(POWER2_OUT);
    expect(y!.keyframes[1]?.easing).toBe(POWER2_IN);
  });

  it('uses power2.inOut on the descent of a hand-off, split at mid-arc', () => {
    const y = layer(planCardFlight(handoff), 'element', 1);
    expect(px(transformAt(y!.keyframes, 0.74))).toBeCloseTo(gsapY(handoff, 0.74), 10);
    expect(y!.keyframes[1]?.easing).toBe(POWER2_IN);
    expect(y!.keyframes[2]?.easing).toBe(POWER2_OUT);
  });

  it('keeps the same rotate/scale flight ease and the two settle shapes', () => {
    const pile = layer(planCardFlight(land), 'card');
    expect(pile?.keyframes[0]).toMatchObject({
      rotate: '-7deg',
      scale: '1',
      easing: SINE_IN_OUT,
    });
    expect(pile?.keyframes[1]).toMatchObject({ rotate: '2deg', scale: '1' });
    const squash = pile!.keyframes.find((frame) => frame.scale === '1.035 0.965');
    expect(squash?.offset).toBeCloseTo((0.2 + 0.08 * 0.42) / 0.28, 10);

    const seat = layer(planCardFlight(handoff), 'card');
    expect(seat?.keyframes.some((frame) => Number(frame.scale) === 0.85 * 1.08)).toBe(true);
    expect(seat?.keyframes.at(-1)).toMatchObject({ scale: '0.85', rotate: '-4deg' });
    expect(layer(planCardFlight(handoff), 'glint')).toBeUndefined();
  });

  it('samples flip rotateY from back.out(1.7) after holding −88°', () => {
    const flip = layer(planCardFlight({ ...land, flip: true }), 'card', 1);
    expect(flip?.keyframes[0]).toMatchObject({ transform: 'rotateY(-88deg)', offset: 0 });
    expect(flip?.keyframes[1]).toMatchObject({ transform: 'rotateY(-88deg)', offset: 0.45 });
    const landed = flip!.keyframes.find((frame) => frame.offset === 0.95);
    expect(landed?.transform).toBe('rotateY(0deg)');
    const ease = gsap.parseEase('back.out(1.7)');
    const mid = flip!.keyframes.find((frame) => frame.offset === 0.45 + 0.5 * 0.5);
    expect(px(String(mid?.transform))).toBeCloseTo(-88 + 88 * ease(0.5), 5);
  });

  it('holds the flyer visible until the GSAP hide time, then fades or snaps', () => {
    const pile = layer(planCardFlight(land), 'element', 2);
    expect(pile?.keyframes).toEqual([
      { opacity: 1, offset: 0, easing: 'step-end' },
      { opacity: 0, offset: 1 },
    ]);
    const seat = layer(planCardFlight(handoff), 'element', 2);
    expect(seat?.keyframes[1]?.offset).toBeCloseTo((0.2 + 0.08 * 0.45) / 0.28, 10);
    expect(seat?.keyframes[1]?.easing).toBe(POWER2_IN);
  });
});

describe('playCardFlight', () => {
  it('drives each layer through element.animate and cancels without leftover styles', () => {
    const calls: Array<{
      el: HTMLElement;
      keyframes: Keyframe[];
      options: KeyframeAnimationOptions;
    }> = [];
    const cancel = vi.fn();
    const stub = (el: HTMLElement) => {
      el.animate = ((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
        calls.push({ el, keyframes, options });
        return { cancel } as unknown as Animation;
      }) as typeof el.animate;
      return el;
    };
    const element = stub(document.createElement('div'));
    const card = stub(document.createElement('span'));
    const trail = stub(document.createElement('i'));
    const glint = stub(document.createElement('i'));

    const animations = playCardFlight({ element, card, trail, glint }, land);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.some((call) => call.options.composite === 'add')).toBe(true);
    expect(calls.every((call) => call.options.fill === 'forwards')).toBe(true);
    expect(calls.every((call) => call.options.delay === 80)).toBe(false);
    expect(calls.filter((call) => call.el === glint)[0]?.options.delay).toBe(80 + 200);

    cancelWaapiAnimations(animations);
    expect(cancel).toHaveBeenCalledTimes(animations.length);
    expect(element.getAttribute('style')).toBeNull();
    expect(card.getAttribute('style')).toBeNull();
  });
});
