/**
 * The diorama's pure maths: seeded randomness, interpolation, value noise.
 *
 * These were declared inside `mountParlourDiorama`, which meant a 4,000-line
 * closure carried its own copy of six functions that depend on nothing but
 * their arguments. Out here they are typed, testable, and — because they hold
 * no state — safe to call from any layer of the scene.
 *
 * Nothing in this module touches the DOM or a clock. The scenes are baked from
 * a seed and animated from a supplied `t`, so the same seed always paints the
 * same trees, the same grain, the same scatter of stars.
 */

/** A deterministic 0–1 generator. Mulberry32: small, fast, good enough for art. */
export type Random = () => number;

export function mulberry(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Hash of an integer lattice point to 0–1 — the seed of the value noise below. */
export function hashi(ix: number, iy: number): number {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Value noise with a smoothstep fade, so the lattice does not show as a grid. */
export function noise2(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(hashi(x0, y0), hashi(x0 + 1, y0), u),
    lerp(hashi(x0, y0 + 1), hashi(x0 + 1, y0 + 1), u),
    v,
  );
}

/** Fractal Brownian motion — octaves of {@link noise2} for grain and cloud. */
export function fbm(x: number, y: number, oct = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < oct; i += 1) {
    sum += noise2(x * freq, y * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

/** `#rrggbb` plus an alpha, as the `rgba()` string canvas wants. */
export function hex(value: string, alpha = 1): string {
  const n = value.replace('#', '');
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(
    n.slice(4, 6),
    16,
  )},${alpha})`;
}
