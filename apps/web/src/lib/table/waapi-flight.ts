import type { FxCue } from '@/lib/table/fx-motion';
import {
  BACK_OUT_SAMPLES,
  POWER1_OUT,
  POWER2_IN,
  POWER2_OUT,
  SINE_IN_OUT,
  gsapBackOut,
  gsapPower2In,
  gsapPower2InOut,
  gsapPower2Out,
  power2InOutMid,
} from '@/lib/table/waapi-eases';

export type CardFlightCue = Extract<
  FxCue,
  { type: 'deal' | 'flip' | 'draw' | 'discard' | 'trick-play' | 'transfer' | 'layoff' }
>;

export function isCardFlightCue(cue: FxCue): cue is CardFlightCue {
  switch (cue.type) {
    case 'deal':
    case 'flip':
    case 'draw':
    case 'discard':
    case 'trick-play':
    case 'transfer':
    case 'layoff':
      return true;
    default:
      return false;
  }
}

/**
 * Geometry and timing the shared hook already computed. Seconds, same units
 * GSAP was using, so a 180 ms flight is still `0.18`.
 */
export type CardFlightSpec = {
  startMs: number;
  flightDuration: number;
  settleDuration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  arcPeak: number;
  takeoffRotate: number;
  landingRotation: number;
  landingScale: number;
  handoff: boolean;
  flip: boolean;
};

export type CardFlightTargets = {
  element: HTMLElement;
  card: HTMLElement;
  trail: HTMLElement | null;
  glint: HTMLElement | null;
};

export type FlightLayer = 'element' | 'card' | 'trail' | 'glint';

export type PlannedFlight = {
  layer: FlightLayer;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
};

const HOLD = 'forwards' as const;

function flightOptions(
  spec: CardFlightSpec,
  durationSec: number,
  extra?: Omit<KeyframeAnimationOptions, 'delay' | 'duration' | 'fill' | 'easing'>,
): KeyframeAnimationOptions {
  return {
    delay: spec.startMs,
    duration: durationSec * 1000,
    fill: HOLD,
    easing: 'linear',
    ...extra,
  };
}

/**
 * One `translate(x, y)` on the flyer, sampled so X and Y can keep their own
 * GSAP eases. Two additive `transform` animations used to do that, but WebKit
 * drops `composite: 'add'` on `transform` — X never leaves 0, so every
 * opponent deal parks a cutoff card on the left edge until the next burst
 * unmounts the leftover flyers.
 */
export function planCardFlight(spec: CardFlightSpec): PlannedFlight[] {
  const flight = spec.flightDuration;
  const settle = spec.settleDuration;
  const total = flight + settle;
  const planned: PlannedFlight[] = [
    {
      layer: 'element',
      keyframes: xyKeyframes(spec),
      options: flightOptions(spec, flight),
    },
    {
      layer: 'element',
      keyframes: opacityKeyframes(spec, total),
      options: flightOptions(spec, total),
    },
    {
      layer: 'card',
      keyframes: cardPoseKeyframes(spec, total),
      options: flightOptions(spec, total),
    },
    {
      layer: 'trail',
      keyframes: trailKeyframes(flight),
      options: flightOptions(spec, trailDuration(flight)),
    },
  ];
  if (!spec.handoff) {
    planned.push({
      layer: 'glint',
      keyframes: [
        { opacity: 0, transform: 'scale(0.45)' },
        { opacity: 0.9, transform: 'scale(2.4)' },
      ],
      options: {
        ...flightOptions(spec, settle),
        delay: spec.startMs + flight * 1000,
        easing: POWER2_OUT,
      },
    });
  }
  if (spec.flip) {
    planned.push({
      layer: 'card',
      keyframes: flipKeyframes(),
      options: flightOptions(spec, flight),
    });
  }
  return planned;
}

export function playCardFlight(targets: CardFlightTargets, spec: CardFlightSpec): Animation[] {
  const animations: Animation[] = [];
  for (const step of planCardFlight(spec)) {
    const node = targets[step.layer];
    if (!node || typeof node.animate !== 'function') continue;
    animations.push(node.animate(step.keyframes, step.options));
  }
  hideFlyerWhenSettled(targets.element, animations);
  return animations;
}

function hideFlyerWhenSettled(element: HTMLElement, animations: readonly Animation[]): void {
  const finished = animations.flatMap((animation) =>
    animation.finished !== undefined ? [animation.finished] : [],
  );
  if (finished.length === 0) return;
  void Promise.all(finished)
    .then(() => {
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
    })
    .catch(() => {
      /* cancelled — leave the node alone so cleanup can revert */
    });
}

export function cancelWaapiAnimations(animations: readonly Animation[]): void {
  for (const animation of animations) animation.cancel();
}

/** Samples per flight so the arc stays smooth without additive transforms. */
export const FLIGHT_XY_SAMPLES = 16;

function xyKeyframes(spec: CardFlightSpec): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= FLIGHT_XY_SAMPLES; i += 1) {
    const t = i / FLIGHT_XY_SAMPLES;
    const { x, y } = flightXy(spec, t);
    frames.push({ transform: `translate(${x}px, ${y}px)`, offset: t });
  }
  return frames;
}

export function flightXy(spec: CardFlightSpec, t: number): { x: number; y: number } {
  return { x: flightX(spec, t), y: flightY(spec, t) };
}

function flightX(spec: CardFlightSpec, t: number): number {
  return spec.fromX + (spec.toX - spec.fromX) * gsapPower2InOut(t);
}

function flightY(spec: CardFlightSpec, t: number): number {
  if (t <= 0.48) {
    const local = t / 0.48;
    return spec.fromY + (spec.arcPeak - spec.fromY) * gsapPower2Out(local);
  }
  if (spec.handoff) {
    const midY = power2InOutMid(spec.arcPeak, spec.toY);
    if (t <= 0.74) {
      const local = (t - 0.48) / 0.26;
      return spec.arcPeak + (midY - spec.arcPeak) * gsapPower2In(local);
    }
    const local = (t - 0.74) / 0.26;
    return midY + (spec.toY - midY) * gsapPower2Out(local);
  }
  const local = (t - 0.48) / 0.52;
  return spec.arcPeak + (spec.toY - spec.arcPeak) * gsapPower2In(local);
}

function opacityKeyframes(spec: CardFlightSpec, total: number): Keyframe[] {
  if (spec.handoff) {
    const fadeAt = (spec.flightDuration + spec.settleDuration * 0.45) / total;
    return [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: fadeAt, easing: POWER2_IN },
      { opacity: 0, offset: 1 },
    ];
  }
  return [
    { opacity: 1, offset: 0, easing: 'step-end' },
    { opacity: 0, offset: 1 },
  ];
}

function cardPoseKeyframes(spec: CardFlightSpec, total: number): Keyframe[] {
  const flightEnd = spec.flightDuration / total;
  const frames: Keyframe[] = [
    pose(spec.takeoffRotate, 1, 1, 0, SINE_IN_OUT),
    pose(spec.landingRotation, spec.landingScale, spec.landingScale, flightEnd),
  ];
  if (spec.handoff) {
    const popEnd = (spec.flightDuration + spec.settleDuration * 0.4) / total;
    frames[1] = pose(
      spec.landingRotation,
      spec.landingScale,
      spec.landingScale,
      flightEnd,
      POWER2_OUT,
    );
    frames.push(
      pose(
        spec.landingRotation,
        spec.landingScale * 1.08,
        spec.landingScale * 1.08,
        popEnd,
        POWER2_IN,
      ),
      pose(
        spec.landingRotation,
        power2InOutMid(spec.landingScale * 1.08, spec.landingScale),
        power2InOutMid(spec.landingScale * 1.08, spec.landingScale),
        popEnd + (1 - popEnd) * 0.5,
        POWER2_OUT,
      ),
      pose(spec.landingRotation, spec.landingScale, spec.landingScale, 1),
    );
    return frames;
  }
  const squashEnd = (spec.flightDuration + spec.settleDuration * 0.42) / total;
  frames[1] = pose(
    spec.landingRotation,
    spec.landingScale,
    spec.landingScale,
    flightEnd,
    POWER2_IN,
  );
  frames.push(pose(spec.landingRotation, 1.035, 0.965, squashEnd, 'linear'));
  for (let i = 1; i <= BACK_OUT_SAMPLES; i += 1) {
    const t = i / BACK_OUT_SAMPLES;
    const eased = gsapBackOut(t, 2.2);
    frames.push(
      pose(
        spec.landingRotation,
        1.035 + (1 - 1.035) * eased,
        0.965 + (1 - 0.965) * eased,
        squashEnd + (1 - squashEnd) * t,
        'linear',
      ),
    );
  }
  return frames;
}

function flipKeyframes(): Keyframe[] {
  const frames: Keyframe[] = [
    { transform: 'rotateY(-88deg)', offset: 0 },
    { transform: 'rotateY(-88deg)', offset: 0.45 },
  ];
  for (let i = 1; i <= BACK_OUT_SAMPLES; i += 1) {
    const t = i / BACK_OUT_SAMPLES;
    frames.push({
      transform: `rotateY(${-88 + 88 * gsapBackOut(t, 1.7)}deg)`,
      offset: 0.45 + 0.5 * t,
    });
  }
  frames.push({ transform: 'rotateY(0deg)', offset: 1 });
  return frames;
}

function trailDuration(flight: number): number {
  return flight * 0.58 + Math.min(0.1, flight * 0.45);
}

function trailKeyframes(flight: number): Keyframe[] {
  const fadeIn = Math.min(0.07, flight * 0.35);
  const fadeOut = Math.min(0.1, flight * 0.45);
  const holdUntil = flight * 0.58;
  const total = holdUntil + fadeOut;
  return [
    { opacity: 0, offset: 0, easing: POWER1_OUT },
    { opacity: 0.92, offset: fadeIn / total },
    { opacity: 0.92, offset: holdUntil / total, easing: POWER1_OUT },
    { opacity: 0, offset: 1 },
  ];
}

function pose(
  rotate: number,
  scaleX: number,
  scaleY: number,
  offset: number,
  easing?: string,
): Keyframe {
  const frame: Keyframe = {
    offset,
    rotate: `${rotate}deg`,
    scale: scaleX === scaleY ? `${scaleX}` : `${scaleX} ${scaleY}`,
  };
  if (easing) frame.easing = easing;
  return frame;
}
