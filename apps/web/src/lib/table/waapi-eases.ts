/**
 * GSAP 3.15 ease curves, expressed for the Web Animations API.
 *
 * Source of truth: `gsap-core.js` `_insertEase` / `_configBack` / Sine.
 * Power names are one off the polynomial degree:
 *
 *   Linear, Quad, Cubic, Quart, Quint  →  Power0..Power4
 *   Power2 === Cubic === p ** 3
 *
 * so `power2` is not a quadratic (that is Power1 / Quad). The CSS cheat-sheet
 * value `cubic-bezier(0.645, 0.045, 0.355, 1)` is easings.net's *approximation*
 * of easeInOutCubic — it is not GSAP's piecewise
 * `p < 0.5 ? 4p³ : 1 - 4(1-p)³`.
 *
 * A cubic polynomial in *linear time* is an exact CSS cubic-bezier: with
 * x-controls at 1/3 and 2/3, `x(t) = t`, and the y-controls become the
 * polynomial's coefficients. That gives exact `power2.in` / `power2.out` and
 * `power1.out`. `power2.inOut` is two of those halves joined at 0.5, so a
 * single bezier cannot be exact — callers split the segment instead.
 *
 * `sine.inOut` is transcendental; the CSS stand-in below is the conventional
 * `cubic-bezier(0.37, 0, 0.63, 1)`. `back.out(s)` can be written as
 * `cubic-bezier(1/3, (s+3)/3, 2/3, 1)`, but y > 1 is unevenly implemented, so
 * flights sample the GSAP polynomial instead.
 */

/** Linear-time cubic: x-controls at 1/3, 2/3 so y(t) is an exact polynomial. */
const T1 = 1 / 3;
const T2 = 2 / 3;

/** GSAP `power2.in` = Cubic in = t³. */
export const POWER2_IN = `cubic-bezier(${T1}, 0, ${T2}, 0)`;

/** GSAP `power2.out` = Cubic out = 1 − (1 − t)³. */
export const POWER2_OUT = `cubic-bezier(${T1}, 1, ${T2}, 1)`;

/**
 * GSAP's default tween ease when none is given: `quad.out` = Power1.out =
 * 1 − (1 − t)². Used for the trail fade, which never names an ease.
 */
export const POWER1_OUT = `cubic-bezier(${T1}, ${T2}, ${T2}, 1)`;

/** Conventional CSS stand-in for GSAP `sine.inOut` = (1 − cos(πt)) / 2. */
export const SINE_IN_OUT = 'cubic-bezier(0.37, 0, 0.63, 1)';

export const BACK_OUT_SAMPLES = 16;

export function gsapPower2In(p: number): number {
  return p ** 3;
}

export function gsapPower2Out(p: number): number {
  return 1 - (1 - p) ** 3;
}

/** Same piecewise cubic GSAP registers as `power2.inOut`. */
export function gsapPower2InOut(p: number): number {
  return p < 0.5 ? (p * 2) ** 3 / 2 : 1 - ((1 - p) * 2) ** 3 / 2;
}

export function gsapPower1Out(p: number): number {
  return 1 - (1 - p) ** 2;
}

export function gsapSineInOut(p: number): number {
  return -(Math.cos(Math.PI * p) - 1) / 2;
}

/**
 * GSAP `_configBack("out", s)`: `p ? ((--p)*p*((s+1)*p+s)+1) : 0`,
 * i.e. 1 + (s+1)(p−1)³ + s(p−1)².
 */
export function gsapBackOut(p: number, overshoot: number): number {
  if (p === 0) return 0;
  const t = p - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

/** Midpoint of a `power2.inOut` segment — the join is always halfway. */
export function power2InOutMid(from: number, to: number): number {
  return from + (to - from) * 0.5;
}

export function sampleBackOut(from: number, to: number, overshoot: number): number[] {
  const values: number[] = [];
  for (let i = 0; i <= BACK_OUT_SAMPLES; i += 1) {
    const t = i / BACK_OUT_SAMPLES;
    values.push(from + (to - from) * gsapBackOut(t, overshoot));
  }
  return values;
}
