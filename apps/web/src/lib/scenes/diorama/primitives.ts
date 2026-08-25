/**
 * The diorama's canvas primitives — the handful of shapes every scene draws.
 *
 * Extracted from the scene closure for the same reason as the noise: they are
 * functions of their arguments and nothing else, so they can be typed once and
 * shared rather than living inside a file that opted out of type checking.
 *
 * {@link context2d} is the important one. Every `getContext('2d')` returns a
 * nullable, and the diorama makes dozens of offscreen canvases; threading that
 * null through every call site was the single largest source of the type debt
 * that kept the old file under `@ts-nocheck`. A canvas that cannot give a 2D
 * context is not a case the scene can render around — it is a browser that
 * cannot draw at all — so it is asserted here, once.
 */

import { hex } from './noise';

/**
 * The live scene is a full-bleed layer under home chrome and every table.
 * `desynchronized` opens a second swap chain; on Windows, DComp clears the
 * overlay tiles (logo, Play, filtered cards) to black whenever parallax
 * presents a new bitmap. Keep this on the page compositor.
 */
export const LIVE_SCENE_CONTEXT: CanvasRenderingContext2DSettings = {
  alpha: false,
};

/** A 2D context, or a thrown error. See the note above on why this asserts. */
export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('this canvas cannot provide a 2D context');
  return ctx;
}

/** An offscreen canvas painted once and then used as a texture or pattern. */
export function makeTex(
  w: number,
  h: number,
  paint: (c: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(context2d(c));
  return c;
}

/**
 * Glows are the scene's most-called primitive — embers, firelight, lamps, every
 * soft halo — and each call used to build a fresh radial gradient. The shape is
 * always the same: opaque at the centre, a third of the way out at 40%,
 * transparent at the rim. So one unit-radius gradient per colour is built once
 * and then placed by scaling the context; the per-call alpha is applied as
 * `globalAlpha`, which composites identically for a single fill.
 */
const unitGlows = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();

export function unitGlow(c: CanvasRenderingContext2D, color: string): CanvasGradient {
  let byColor = unitGlows.get(c);
  if (!byColor) {
    byColor = new Map();
    unitGlows.set(c, byColor);
  }
  let gradient = byColor.get(color);
  if (!gradient) {
    gradient = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, hex(color, 1));
    gradient.addColorStop(0.4, hex(color, 0.34));
    gradient.addColorStop(1, hex(color, 0));
    byColor.set(color, gradient);
  }
  return gradient;
}

export function glow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
): void {
  if (r <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y);
  c.scale(r, r);
  c.fillStyle = unitGlow(c, color);
  c.beginPath();
  c.arc(0, 0, 1, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient | CanvasPattern,
): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

/** Rounded rect. `r` takes anything `roundRect` does, including a corner list. */
export function rr(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
  color: string | CanvasGradient | CanvasPattern,
): void {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

export function clipDraw(c: CanvasRenderingContext2D, path: () => void, paint: () => void): void {
  c.save();
  c.beginPath();
  path();
  c.clip();
  paint();
  c.restore();
}

export function fillPat(
  c: CanvasRenderingContext2D,
  tex: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
): void {
  const pattern = c.createPattern(tex, 'repeat');
  if (!pattern) return;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = pattern;
  c.fillRect(x, y, w, h);
  c.restore();
}

/** One wobbling flame tongue; `comp='lighter'` for hot cores. */
export function tongue(
  c: CanvasRenderingContext2D,
  t: number,
  x: number,
  y: number,
  bw: number,
  h: number,
  color: string | CanvasGradient,
  ph: number,
  lean: number,
  comp?: GlobalCompositeOperation,
): void {
  const w1 = Math.sin(t * 3.1 + ph) * 0.55 + Math.sin(t * 5.9 + ph * 1.7) * 0.45;
  const w2 = Math.sin(t * 4.3 + ph * 2.3);
  const hh = h * (1 + w2 * 0.07);
  const tip = lean + bw * 0.85 * w1;
  c.save();
  if (comp) c.globalCompositeOperation = comp;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - bw, y);
  c.bezierCurveTo(
    x - bw * 1.24,
    y - hh * 0.3,
    x - bw * 0.45 + tip * 0.45,
    y - hh * 0.62,
    x + tip,
    y - hh,
  );
  c.bezierCurveTo(
    x + bw * 0.45 + tip * 0.45,
    y - hh * 0.56,
    x + bw * 1.24,
    y - hh * 0.27,
    x + bw,
    y,
  );
  c.closePath();
  c.fill();
  c.restore();
}
