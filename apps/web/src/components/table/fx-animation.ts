'use client';

import { useEffect, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { gsap } from 'gsap';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { soundCuesForFx, soundDefsForSfxPack } from '@/lib/audio/sfx';
import { calculateFanStep } from '@/components/table/HandRail';
import { prefersCalmMotion } from '@/lib/table/calm-motion';
import { FX_TIMING, type FxCue, type Zone } from '@/lib/table/fx-motion';
import styles from '@/styles/table.module.css';

/**
 * Shared table presentation plumbing: both game screens (Blitz, Wild) animate
 * exclusively from engine fx cues through these hooks, so a new deck skin only
 * has to render its own cards.
 */

export function useTableAudio(fx: readonly FxEvent[], fxKey: string | number, sfxPackId: string) {
  // The pack is registered once. It used to be re-registered on every burst,
  // which rebuilt the pack's whole sound manifest — the shared Foley layer
  // concatenated with the game's, de-duplicated — several times a second for a
  // set of definitions that cannot change while the table is open.
  useEffect(() => {
    getAudioManager().preload(soundDefsForSfxPack(sfxPackId));
  }, [sfxPackId]);

  useEffect(() => {
    const audio = getAudioManager();
    const timers = soundCuesForFx(fx, sfxPackId).map((cue) =>
      window.setTimeout(() => audio.play(cue.id, { rate: cue.rate }), cue.atMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fx, fxKey, sfxPackId]);
}

export function useFxAnimation(
  cues: readonly FxCue[],
  rootRef: RefObject<HTMLElement | null>,
  key: string | number,
  /**
   * Profile-level calm motion. Optional so every existing caller keeps the
   * OS-media-query behaviour it already had; the two are OR-ed, never swapped.
   */
  forceReduced = false,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || cues.length === 0) return;
    const reduced =
      forceReduced || prefersCalmMotion();

    if (reduced) {
      // Calm motion has to mean no waiting, not merely no travel. Flashing each
      // cue at its own `startMs` still stretched an opening deal across every
      // stagger — 52 cues at 65ms is well over three seconds of a player
      // watching nothing move. The state these flights narrate is already
      // resolved immediately for a reduced-motion player (deal admission
      // settles on the next tick), so the flights have nothing left to say.
      const context = gsap.context(() => {
        for (const cue of cues) {
          const element = root.querySelector<HTMLElement>(`[data-fx-cue="${cue.id}"]`);
          if (element) gsap.set(element, { autoAlpha: 0 });
        }
      }, root);
      return () => context.revert();
    }

    const bounds = root.getBoundingClientRect();
    // One walk of the fx layer instead of a selector scan per cue. A stacked
    // pickup plans a dozen cues, and each `querySelector` was a fresh descent
    // of the whole table.
    const elements = new Map<string, HTMLElement>();
    for (const node of root.querySelectorAll<HTMLElement>('[data-fx-cue]')) {
      const id = node.dataset.fxCue;
      if (id !== undefined && !elements.has(id)) elements.set(id, node);
    }
    // Zones are fixed for the length of one burst — every card in a ten-card
    // pickup flies from the same stock pile — so each is measured once.
    const cache: FlightCache = { zones: new Map(), faceWidths: new Map() };

    const context = gsap.context(() => {
      const timeline = gsap.timeline();
      // Planning a cue measures the table (bounding boxes, computed transforms,
      // fan geometry). Writing a custom property back to an element in the same
      // pass invalidates layout, so the next cue's measurement forces a fresh
      // one — a stacked pickup or a discard-all sweep turned into a dozen
      // synchronous layouts. The writes are collected and flushed once, after
      // every cue has been measured.
      const angleWrites: Array<[HTMLElement, string]> = [];
      for (const cue of cues) {
        const element = elements.get(cue.id);
        if (!element) continue;
        const start = cue.startMs / 1000;
        if (
          cue.type === 'deal' ||
          cue.type === 'flip' ||
          cue.type === 'draw' ||
          cue.type === 'discard' ||
          cue.type === 'trick-play' ||
          cue.type === 'transfer' ||
          cue.type === 'layoff'
        ) {
          const cueCard = 'card' in cue ? cue.card : undefined;
          // Only live pickups/transfers seat into a fan slot. Deal flights have
          // to stay zone-to-zone — the destination card is not in the rail yet,
          // and the opening deal runs before the table has a stable layout.
          const seatIntoFan = cue.type === 'draw' || cue.type === 'transfer';
          const leaveFromFan =
            (cue.type === 'discard' ||
              cue.type === 'trick-play' ||
              cue.type === 'layoff' ||
              cue.type === 'transfer') &&
            cue.from.startsWith('hand:');
          const from =
            leaveFromFan || seatIntoFan
              ? flightPoint(cue.from, root, bounds, cueCard, element, cache)
              : zonePoint(cue.from, root, bounds, cache);
          const to = seatIntoFan
            ? flightPoint(cue.to, root, bounds, cueCard, element, cache)
            : zonePoint(cue.to, root, bounds, cache);
          const card = element.querySelector<HTMLElement>('[data-flight-card]') ?? element;
          const trail = element.querySelector<HTMLElement>(`.${styles.cardTrail}`);
          const glint = element.querySelector<HTMLElement>(`.${styles.cardGlint}`);
          const flightMs =
            cue.type === 'discard' ? cue.durationMs - FX_TIMING.settleMs : cue.durationMs;
          const flightDuration = Math.max(0.12, flightMs / 1000);
          const settleDuration = FX_TIMING.settleMs / 1000;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const direction = dx < 0 ? -1 : 1;
          const distance = Math.hypot(dx, dy);
          const arcHeight = Math.min(118, Math.max(38, distance * 0.18));
          const arcPeak = Math.min(from.y, to.y) - arcHeight;
          const apexAt = start + flightDuration * 0.48;
          const landingRotation =
            to.handoff && to.rotate !== undefined
              ? to.rotate
              : cue.type === 'layoff'
                ? 0
                : cue.type === 'discard'
                  ? discardRotation(cue.card, 0)
                  : direction * 2;
          const landingScale = to.scale ?? 1;
          angleWrites.push([element, `${Math.atan2(dy, dx)}rad`]);
          timeline
            .set(element, { x: from.x, y: from.y, autoAlpha: 1 }, start)
            .set(
              card,
              {
                rotate: direction * -7,
                rotateY: cue.type === 'flip' ? -88 : 0,
                scale: 1,
                scaleX: 1,
                scaleY: 1,
              },
              start,
            )
            .to(
              element,
              {
                x: to.x,
                duration: flightDuration,
                ease: 'power2.inOut',
              },
              start,
            )
            .to(element, { y: arcPeak, duration: flightDuration * 0.48, ease: 'power2.out' }, start)
            .to(
              element,
              {
                y: to.y,
                duration: flightDuration * 0.52,
                ease: to.handoff ? 'power2.inOut' : 'power2.in',
              },
              apexAt,
            )
            .to(
              card,
              {
                rotate: landingRotation,
                scale: landingScale,
                duration: flightDuration,
                ease: 'sine.inOut',
              },
              start,
            )
            .fromTo(
              trail,
              { autoAlpha: 0 },
              { autoAlpha: 0.92, duration: Math.min(0.07, flightDuration * 0.35) },
              start,
            )
            .to(
              trail,
              { autoAlpha: 0, duration: Math.min(0.1, flightDuration * 0.45) },
              start + flightDuration * 0.58,
            );
          if (to.handoff) {
            // Seat into the waiting fan slot, then fade the flyer after the
            // real card is already underneath it — one card, not a collision.
            timeline
              .to(
                card,
                {
                  scale: landingScale * 1.08,
                  duration: settleDuration * 0.4,
                  ease: 'power2.out',
                },
                start + flightDuration,
              )
              .to(
                card,
                {
                  scale: landingScale,
                  duration: settleDuration * 0.6,
                  ease: 'power2.inOut',
                },
                start + flightDuration + settleDuration * 0.4,
              )
              .to(
                element,
                { autoAlpha: 0, duration: settleDuration * 0.55, ease: 'power2.in' },
                start + flightDuration + settleDuration * 0.45,
              );
          } else {
            timeline
              .fromTo(
                glint,
                { autoAlpha: 0, scale: 0.45 },
                {
                  autoAlpha: 0.9,
                  scale: 2.4,
                  duration: settleDuration,
                  ease: 'power2.out',
                },
                start + flightDuration,
              )
              .to(
                card,
                {
                  scaleX: 1.035,
                  scaleY: 0.965,
                  duration: settleDuration * 0.42,
                  ease: 'power2.in',
                },
                start + flightDuration,
              )
              .to(
                card,
                {
                  scaleX: 1,
                  scaleY: 1,
                  duration: settleDuration * 0.58,
                  ease: 'back.out(2.2)',
                },
                start + flightDuration + settleDuration * 0.42,
              )
              .set(element, { autoAlpha: 0 }, start + flightDuration + settleDuration);
          }
          if (cue.type === 'flip') {
            timeline.to(
              card,
              {
                rotateY: 0,
                duration: flightDuration * 0.5,
                ease: 'back.out(1.7)',
              },
              start + flightDuration * 0.45,
            );
          }
        } else if (cue.type === 'knock' || cue.type === 'blitz' || cue.type === 'gin-burst') {
          timeline
            .fromTo(
              element,
              { autoAlpha: 0, scale: 0.2, rotate: -8 },
              {
                autoAlpha: 1,
                scale: 1.1,
                rotate: 0,
                duration: 0.22,
                ease: 'back.out(2.4)',
              },
              start,
            )
            .to(element, { scale: 1, duration: 0.12, ease: 'power2.out' })
            .to(
              element,
              { autoAlpha: 0, scale: 1.18, duration: 0.28, ease: 'power2.in' },
              start + cue.durationMs / 1000 - 0.28,
            );
          if (cue.type === 'knock') {
            timeline.to(
              root.querySelector('[data-table-screen]') ?? root,
              {
                x: 4,
                duration: 0.04,
                repeat: 3,
                yoyo: true,
                ease: 'none',
              },
              start,
            );
          }
        } else {
          const point = zonePoint(`seat:${cue.seat}`, root, bounds, cache);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.4 }, start)
            .to(element, { autoAlpha: 1, scale: 1.1, duration: 0.2, ease: 'back.out(2)' }, start)
            .to(
              element,
              { autoAlpha: 0, scale: 0.9, duration: 0.2 },
              start + cue.durationMs / 1000 - 0.2,
            );
        }
      }
      for (const [element, angle] of angleWrites) {
        element.style.setProperty('--flight-angle', angle);
      }
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key, forceReduced]);
}

export type FlightPoint = {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
  handoff?: boolean;
};

/**
 * Per-burst memo for measurements that cannot change while one burst is being
 * planned.
 *
 * Ten cards leaving the same pickup all fly from the same stock pile, and every
 * card in a fan is the same width — but each cue was re-finding and
 * re-measuring both. Optional so the exported helpers keep working uncached for
 * the other tables that call them one cue at a time.
 */
export type FlightCache = {
  zones: Map<string, FlightPoint>;
  faceWidths: Map<string, number>;
};

/**
 * Annotated as a `FlightPoint` (whose extra fields are all optional) so that
 * `cond ? flightPoint(...) : zonePoint(...)` collapses to one type instead of
 * a union that has no `handoff`/`rotate`/`scale` on half its arms.
 */
export function zonePoint(
  zone: Zone,
  root: HTMLElement,
  bounds: DOMRect,
  cache?: FlightCache,
): FlightPoint {
  const cached = cache?.zones.get(zone);
  if (cached) return cached;
  const point = measureZone(zone, root, bounds);
  cache?.zones.set(zone, point);
  return point;
}

function measureZone(zone: Zone, root: HTMLElement, bounds: DOMRect): FlightPoint {
  const anchor =
    root.querySelector<HTMLElement>(`[data-zone="${zone}"]`) ??
    (zone.includes(':')
      ? root.querySelector<HTMLElement>(`[data-seat="${zone.split(':')[1]}"]`)
      : null);
  if (anchor) {
    // Pile buttons are narrower than the card chassis, so the zone box sits
    // left of the visible deck. Aim at the face inside the zone when we can.
    // Hands must stay on the rail — the first .card is just the leftmost card.
    const face = zone.startsWith('hand:')
      ? anchor
      : (anchor.querySelector<HTMLElement>('[data-zone-face]') ??
        anchor.querySelector<HTMLElement>(`.${styles.card}`) ??
        anchor);
    const rect = face.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      };
    }
  }
  const points: Record<string, readonly [number, number]> = {
    stock: [0.43, 0.47],
    discard: [0.54, 0.47],
    'hand:0': [0.5, 0.82],
    'hand:1': [0.12, 0.48],
    'hand:2': [0.5, 0.15],
    'hand:3': [0.88, 0.48],
    'seat:0': [0.5, 0.82],
    'seat:1': [0.12, 0.48],
    'seat:2': [0.5, 0.15],
    'seat:3': [0.88, 0.48],
  };
  const [x, y] = points[zone] ?? [0.5, 0.5];
  return { x: x * bounds.width, y: y * bounds.height };
}

/**
 * Prefer the actual fan slot for a named card so a draw lands on the waiting
 * card instead of the rail's midpoint. Falls back to the zone center.
 */
export function flightPoint(
  zone: Zone,
  root: HTMLElement,
  bounds: DOMRect,
  card?: string,
  flyer?: HTMLElement,
  cache?: FlightCache,
): FlightPoint {
  if (card && zone.startsWith('hand:')) {
    const zoneRoot = root.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
    if (!zoneRoot) return zonePoint(zone, root, bounds, cache);
    const slot = findFlightSlot(zoneRoot, card);
    const visual = slot?.querySelector<HTMLElement>('[data-hand-fan]') ?? slot;
    if (visual) {
      const rect = visual.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        const flyerFace = flyer?.querySelector<HTMLElement>('[data-flight-card] > *');
        const faceWidth = fanFaceWidth(zone, visual, cache);
        const scale =
          faceWidth > 0 && flyerFace && flyerFace.offsetWidth > 0
            ? faceWidth / flyerFace.offsetWidth
            : 1;
        return {
          x: rect.left + rect.width / 2 - bounds.left,
          y: rect.top + rect.height / 2 - bounds.top,
          rotate: fanSlotRotationDeg(zoneRoot, slot),
          scale,
          handoff: true,
        };
      }
    }
    const predicted = predictedFanSlot(zoneRoot, bounds, card, flyer);
    if (predicted) return predicted;
  }
  return zonePoint(zone, root, bounds, cache);
}

/** Every card in a fan is the same width, so one of them can answer for all. */
function fanFaceWidth(zone: Zone, visual: HTMLElement, cache?: FlightCache): number {
  const cached = cache?.faceWidths.get(zone);
  if (cached !== undefined) return cached;
  const width = visual.querySelector<HTMLElement>(':scope > *')?.offsetWidth ?? 0;
  cache?.faceWidths.set(zone, width);
  return width;
}

/**
 * The angle of the fan slot a card is flying into.
 *
 * This used to read the slot's computed transform back out and decode it into a
 * matrix — a style resolution and a `DOMMatrix` per flight, and ten of them for
 * a stacked pickup. But the fan's angle is not something the DOM knows better
 * than we do: the stylesheet derives it from `--fan-index` and the hand's card
 * count, both of which the rail publishes. Recomputing it is the same
 * expression the CSS applies, so a settled fan gives an identical answer.
 *
 * Mid-transition the two differ, because the read saw where the slot had got to
 * and this returns where it is going. That is the better target of the two: the
 * flight and the fan's re-flow finish within a frame or so of each other, and a
 * card should land at the angle it is going to rest at.
 */
function fanSlotRotationDeg(rail: HTMLElement, slot: HTMLElement | null): number {
  const fanIndex = Number.parseFloat(slot?.dataset.fanIndex ?? '');
  const fanCount = Number.parseFloat(rail.dataset.fanCount ?? '');
  if (!Number.isFinite(fanIndex) || !Number.isFinite(fanCount) || fanCount <= 0) return 0;
  return fanIndex * Math.min(6, 24 / fanCount);
}

/** Where a card will sit once the fan opens a gap for it. */
function predictedFanSlot(
  rail: HTMLElement,
  bounds: DOMRect,
  card: string,
  flyer?: HTMLElement,
): FlightPoint | null {
  const plan = (rail.dataset.fanPlan ?? '').split(',').filter(Boolean);
  const index = plan.indexOf(card);
  if (index < 0 || plan.length === 0) return null;
  const sample = rail.querySelector<HTMLElement>('[data-hand-card]');
  const cardWidth =
    sample?.offsetWidth ||
    Number.parseFloat(getComputedStyle(rail).getPropertyValue('--hand-card-width')) ||
    0;
  if (cardWidth <= 0) return null;
  const rem = Number.parseFloat(getComputedStyle(rail).fontSize) || 16;
  const step = calculateFanStep(rail.clientWidth, cardWidth, plan.length);
  const fanN = Math.max(plan.length, 1);
  const fanIndex = index - (plan.length - 1) / 2;
  const fanUn = 1 / fanN;
  const liftY =
    Math.abs(fanIndex) * Math.min(0.48, 2.1 * fanUn) * rem -
    (rail.dataset.fanLift === card ? 1.15 * rem : 0);
  const railRect = rail.getBoundingClientRect();
  const flyerFace = flyer?.querySelector<HTMLElement>('[data-flight-card] > *');
  return {
    x: railRect.left + railRect.width / 2 + fanIndex * step - bounds.left,
    y: railRect.top + 0.9 * rem + (cardWidth * 7) / 10 + liftY - bounds.top,
    rotate: fanIndex * Math.min(6, 24 * fanUn),
    scale: flyerFace && flyerFace.offsetWidth > 0 ? cardWidth / flyerFace.offsetWidth : 1,
    handoff: true,
  };
}

function findFlightSlot(root: HTMLElement, card: string): HTMLElement | null {
  const escaped = cssEscape(card);
  return (
    root.querySelector<HTMLElement>(`[data-flight-target="${escaped}"]`) ??
    root.querySelector<HTMLElement>(`[data-hand-card][data-card-id="${escaped}"]`)
  );
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/"/g, '\\"');
}

export function discardRotation(card: string, index: number) {
  let hash = index * 13;
  for (let i = 0; i < card.length; i += 1) hash = (hash * 31 + card.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 19) - 9;
}
