import { gsap } from 'gsap';
import { describe, expect, it } from 'vitest';
import {
  POWER1_OUT,
  POWER2_IN,
  POWER2_OUT,
  SINE_IN_OUT,
  gsapBackOut,
  gsapPower1Out,
  gsapPower2In,
  gsapPower2InOut,
  gsapPower2Out,
  gsapSineInOut,
  sampleBackOut,
} from './waapi-eases';

const PROGRESS = [0, 0.1, 0.25, 0.48, 0.5, 0.52, 0.75, 0.9, 1];

function expectMatchesGsap(name: string, ours: (t: number) => number) {
  const ease = gsap.parseEase(name);
  for (const t of PROGRESS) {
    expect(ours(t), `${name}(${t})`).toBeCloseTo(ease(t), 10);
  }
}

describe('GSAP ease ports', () => {
  it('matches GSAP power2, which is Cubic (t³), not Quad', () => {
    expectMatchesGsap('power2.in', gsapPower2In);
    expectMatchesGsap('power2.out', gsapPower2Out);
    expectMatchesGsap('power2.inOut', gsapPower2InOut);
    expect(gsapPower2In(0.5)).toBeCloseTo(0.125, 10);
    expect(gsap.parseEase('power1.in')(0.5)).toBeCloseTo(0.25, 10);
  });

  it('matches GSAP quad.out — the default ease unnamed tweens use', () => {
    expectMatchesGsap('quad.out', gsapPower1Out);
    expectMatchesGsap('power1.out', gsapPower1Out);
  });

  it('matches GSAP sine.inOut and back.out(overshoot)', () => {
    expectMatchesGsap('sine.inOut', gsapSineInOut);
    expectMatchesGsap('back.out(2.2)', (t) => gsapBackOut(t, 2.2));
    expectMatchesGsap('back.out(1.7)', (t) => gsapBackOut(t, 1.7));
    expect(gsapBackOut(0.5, 2.2)).toBeGreaterThan(1);
  });

  it('uses exact linear-time cubics, not the easings.net power2.inOut cheat', () => {
    expect(POWER2_IN).toBe(`cubic-bezier(${1 / 3}, 0, ${2 / 3}, 0)`);
    expect(POWER2_OUT).toBe(`cubic-bezier(${1 / 3}, 1, ${2 / 3}, 1)`);
    expect(POWER1_OUT).toBe(`cubic-bezier(${1 / 3}, ${2 / 3}, ${2 / 3}, 1)`);
    expect(POWER2_IN).not.toContain('0.645');
    expect(SINE_IN_OUT).toBe('cubic-bezier(0.37, 0, 0.63, 1)');
  });

  it('samples back.out(2.2) from the GSAP polynomial so the squash overshoots', () => {
    const samples = sampleBackOut(1.035, 1, 2.2);
    expect(samples[0]).toBeCloseTo(1.035, 10);
    expect(samples[samples.length - 1]).toBeCloseTo(1, 10);
    expect(Math.min(...samples)).toBeLessThan(1);
    const ease = gsap.parseEase('back.out(2.2)');
    samples.forEach((value, i) => {
      const t = i / (samples.length - 1);
      expect(value).toBeCloseTo(1.035 + (1 - 1.035) * ease(t), 10);
    });
  });
});
