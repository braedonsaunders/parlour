'use client';

import { useEffect, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { gsap } from 'gsap';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { soundCuesForFx, soundDefsForSfxPack } from '@/lib/audio/sfx';
import { FX_TIMING, type FxCue, type Zone } from '@/lib/table/fx-motion';
import styles from '@/styles/table.module.css';

/**
 * Shared table presentation plumbing: both game screens (Blitz, Wild) animate
 * exclusively from engine fx cues through these hooks, so a new deck skin only
 * has to render its own cards.
 */

export function useTableAudio(fx: readonly FxEvent[], fxKey: string | number, sfxPackId: string) {
  useEffect(() => {
    const audio = getAudioManager();
    audio.preload(soundDefsForSfxPack(sfxPackId));
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
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || cues.length === 0) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const bounds = root.getBoundingClientRect();
    const context = gsap.context(() => {
      const timeline = gsap.timeline();
      for (const cue of cues) {
        const element = root.querySelector<HTMLElement>(`[data-fx-cue="${cue.id}"]`);
        if (!element) continue;
        const start = cue.startMs / 1000;
        if (reduced) {
          timeline
            .set(element, { autoAlpha: 1 }, start)
            .set(element, { autoAlpha: 0 }, start + 0.01);
          continue;
        }
        if (
          cue.type === 'deal' ||
          cue.type === 'flip' ||
          cue.type === 'draw' ||
          cue.type === 'discard' ||
          cue.type === 'trick-play' ||
          cue.type === 'transfer'
        ) {
          const from = zonePoint(cue.from, root, bounds);
          const to = zonePoint(cue.to, root, bounds);
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
          const arcHeight = Math.min(118, Math.max(38, Math.hypot(dx, dy) * 0.18));
          const arcPeak = Math.min(from.y, to.y) - arcHeight;
          const apexAt = start + flightDuration * 0.48;
          const landingRotation =
            cue.type === 'discard' ? discardRotation(cue.card, 0) : direction * 2;
          element.style.setProperty('--flight-angle', `${Math.atan2(dy, dx)}rad`);
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
            .to(element, { y: to.y, duration: flightDuration * 0.52, ease: 'power2.in' }, apexAt)
            .to(
              card,
              { rotate: landingRotation, duration: flightDuration, ease: 'sine.inOut' },
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
            )
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
        } else if (cue.type === 'knock' || cue.type === 'blitz') {
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
          const point = zonePoint(`seat:${cue.seat}`, root, bounds);
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
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key]);
}

export function zonePoint(zone: Zone, root: HTMLElement, bounds: DOMRect) {
  const anchor =
    root.querySelector<HTMLElement>(`[data-zone="${zone}"]`) ??
    (zone.includes(':')
      ? root.querySelector<HTMLElement>(`[data-seat="${zone.split(':')[1]}"]`)
      : null);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
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

export function discardRotation(card: string, index: number) {
  let hash = index * 13;
  for (let i = 0; i < card.length; i += 1) hash = (hash * 31 + card.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 19) - 9;
}
