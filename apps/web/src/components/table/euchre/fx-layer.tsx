'use client';

import { useMemo, useEffect, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import type { EuchreSuit } from '@parlour/game-euchre';
import { gsap } from 'gsap';
import { buildEuchreTimeline, type EuchreCue } from '@/lib/euchre/fx';
import { FX_TIMING } from '@/lib/table/fx-motion';
import { zonePoint } from '../fx-animation';
import { PlayingCard } from '../PlayingCard';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/euchre.module.css';

const SUIT_GLYPH: Record<EuchreSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR: Record<EuchreSuit, string> = {
  S: '#cfd8e0',
  H: '#e05a4e',
  D: '#e05a4e',
  C: '#7fd1c1',
};

export function useEuchreFxAnimation(
  fx: readonly FxEvent[],
  rootRef: RefObject<HTMLElement | null>,
  key: string | number,
  localSeat: number,
) {
  const cues = useMemo(() => {
    try {
      return buildEuchreTimeline(fx);
    } catch {
      return [] as EuchreCue[];
    }
  }, [fx]);

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
            .set(element, { autoAlpha: 0 }, start + Math.max(0.01, cue.durationMs / 1000));
          continue;
        }

        if (cue.type === 'trick-play') {
          const from = zonePoint(`hand:${cue.seat}` as never, root, bounds);
          const to = zonePoint('trick' as never, root, bounds);
          const card = element.querySelector<HTMLElement>('[data-flight-card]') ?? element;
          timeline
            .set(element, { x: from.x, y: from.y, autoAlpha: 1 }, start)
            .fromTo(
              card,
              { rotateY: -70, rotate: cue.seat % 2 ? -6 : 6 },
              { rotateY: 0, rotate: 0, duration: 0.16 },
              start,
            )
            .to(
              element,
              { x: to.x, y: to.y, duration: cue.durationMs / 1000, ease: 'power2.out' },
              start,
            )
            .set(element, { autoAlpha: 0 }, start + cue.durationMs / 1000);
        } else if (cue.type === 'trick-collect') {
          const from = zonePoint('trick' as never, root, bounds);
          const to = zonePoint(`seat:${cue.winner}` as never, root, bounds);
          const flight = (cue.durationMs - FX_TIMING.settleMs) / 1000;
          timeline
            .set(element, { x: from.x, y: from.y, autoAlpha: 0.95, scale: 1 }, start)
            .to(
              element,
              { x: to.x, y: to.y, scale: 0.5, duration: flight, ease: 'power2.in' },
              start,
            )
            .to(element, { autoAlpha: 0, duration: 0.12 }, start + flight);
        } else if (cue.type === 'hand-score' || cue.type === 'call') {
          const point =
            cue.type === 'hand-score'
              ? { x: bounds.width / 2, y: bounds.height * 0.34 }
              : zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.4 }, start)
            .to(
              element,
              { autoAlpha: 1, scale: 1.12, duration: 0.22, ease: 'back.out(2.2)' },
              start,
            )
            .to(element, { scale: 1, duration: 0.14 }, start + 0.22)
            .to(
              element,
              { autoAlpha: 0, y: '-=18', duration: 0.26 },
              start + cue.durationMs / 1000 - 0.3,
            );
        } else if (cue.type === 'score-chip') {
          const point = zonePoint(`seat:${cue.team}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y - 26, autoAlpha: 0, scale: 0.6 }, start)
            .to(element, { autoAlpha: 1, scale: 1.15, duration: 0.2, ease: 'back.out(2)' }, start)
            .to(element, { autoAlpha: 0, y: '-=30', duration: 0.24 }, start + 0.32);
        } else {
          // pass / pickup / turn-down — quiet seat pops
          const point = zonePoint(`seat:${seatOf(cue)}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.7 }, start)
            .to(element, { autoAlpha: 0.92, scale: 1, duration: 0.18, ease: 'power2.out' }, start)
            .to(element, { autoAlpha: 0, duration: 0.2 }, start + cue.durationMs / 1000 - 0.2);
        }
      }
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key, localSeat]);

  return cues;
}

function seatOf(cue: EuchreCue): number {
  if (cue.type === 'pass') return cue.seat;
  if (cue.type === 'pickup') return cue.dealer;
  if (cue.type === 'turn-down') return 0;
  return 0;
}

/** Renders the DOM the euchre animator animates; keep in sync with lib/euchre/fx.ts. */
export function EuchreFxLayer({
  fx,
  fxKey,
  localSeat,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  localSeat: number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const cues = useEuchreFxAnimation(fx, rootRef, fxKey, localSeat);
  return (
    <div className={tableStyles.fxLayer} aria-live="polite">
      {cues.map((cue) => {
        if (cue.type === 'trick-play' || cue.type === 'trick-collect') {
          const faceDown = cue.type === 'trick-play' && cue.seat !== localSeat;
          return (
            <div key={`${fxKey}:${cue.id}`} data-fx-cue={cue.id} className={styles.flyingTrickCard}>
              <span data-flight-card>
                <PlayingCard
                  card={
                    cue.type === 'trick-play'
                      ? cue.card
                      : (cue.cards[cue.cards.length - 1] ?? undefined)
                  }
                  faceDown={faceDown}
                />
              </span>
            </div>
          );
        }
        if (cue.type === 'hand-score') {
          const accent =
            cue.reason === 'euchred'
              ? '#a06bb4'
              : cue.reason === 'march-alone'
                ? '#f0c04e'
                : '#5fae7b';
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxBanner}
              style={{ '--banner-accent': accent } as CSSProperties}
            >
              <strong>{bannerTitle(cue.reason)}</strong>
              <span>{bannerSubtitle(cue.reason, cue.points)}</span>
            </div>
          );
        }
        if (cue.type === 'call') {
          const suitGlyph = cue.suit ? SUIT_GLYPH[cue.suit as EuchreSuit] : '';
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': cue.alone ? '#f0c04e' : '#5fae7b' } as CSSProperties}
            >
              {cue.round === 1 ? 'Ordered it up!' : `Trump: ${suitGlyph}`}{' '}
              {cue.alone && '· going alone!'}
            </div>
          );
        }
        if (cue.type === 'pass') {
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': 'rgba(207,216,224,0.5)' } as CSSProperties}
            >
              Pass
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function bannerTitle(reason: string): string {
  switch (reason) {
    case 'euchred':
      return 'EUCHRED!';
    case 'march':
      return 'MARCH!';
    case 'march-alone':
      return 'LONE MARCH!';
    default:
      return 'POINT TAKEN';
  }
}

export function bannerSubtitle(reason: string, points: number): string {
  switch (reason) {
    case 'euchred':
      return `defenders score ${points}`;
    case 'march':
    case 'march-alone':
      return `${points} points`;
    default:
      return '+1 point';
  }
}

export const EUCHRE_SUIT_META = { SUIT_GLYPH, SUIT_COLOR };
