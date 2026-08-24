import { describe, expect, it } from 'vitest';
import { clamp, fbm, hashi, hex, lerp, mulberry, noise2 } from './noise';

/**
 * The scenes are baked once from a fixed seed and blitted for the rest of the
 * session, so a change in any of these functions silently repaints every tree,
 * star and wood grain in the app. These tests pin the properties that matter
 * rather than the exact pixels: determinism, range, and continuity.
 */

describe('mulberry', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry(0x7a11);
    const b = mulberry(0x7a11);
    const first = Array.from({ length: 8 }, a);
    const second = Array.from({ length: 8 }, b);
    expect(first).toEqual(second);
  });

  it('gives different streams for different seeds', () => {
    expect(mulberry(1)()).not.toBe(mulberry(2)());
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry(0xd057);
    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('lerp and clamp', () => {
  it('interpolates the endpoints exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('holds a value inside its bounds', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('hashi', () => {
  it('is stable per lattice point and inside [0, 1)', () => {
    expect(hashi(3, 7)).toBe(hashi(3, 7));
    for (const [x, y] of [
      [0, 0],
      [12, -4],
      [-9, 31],
    ]) {
      const value = hashi(x!, y!);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('separates neighbouring points', () => {
    expect(hashi(0, 0)).not.toBe(hashi(1, 0));
    expect(hashi(0, 0)).not.toBe(hashi(0, 1));
  });
});

describe('noise2', () => {
  it('reproduces the lattice value at integer coordinates', () => {
    expect(noise2(4, 9)).toBeCloseTo(hashi(4, 9), 12);
  });

  it('is continuous — a small step makes a small change', () => {
    const base = noise2(2.5, 3.5);
    expect(Math.abs(noise2(2.5001, 3.5) - base)).toBeLessThan(0.01);
  });

  it('stays inside [0, 1)', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = noise2(i * 0.37, i * 0.91);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('fbm', () => {
  it('is deterministic', () => {
    expect(fbm(1.5, 2.5)).toBe(fbm(1.5, 2.5));
  });

  it('sums to less than one, so callers can treat it as a 0–1 field', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = fbm(i * 0.13, i * 0.29);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('adds detail with octaves rather than replacing it', () => {
    expect(fbm(3, 4, 1)).not.toBe(fbm(3, 4, 4));
  });
});

describe('hex', () => {
  it('expands a six-digit hex to rgba', () => {
    expect(hex('#ff8000')).toBe('rgba(255,128,0,1)');
    expect(hex('ff8000', 0.5)).toBe('rgba(255,128,0,0.5)');
  });

  it('handles pure black and white', () => {
    expect(hex('#000000')).toBe('rgba(0,0,0,1)');
    expect(hex('#ffffff', 0)).toBe('rgba(255,255,255,0)');
  });
});
