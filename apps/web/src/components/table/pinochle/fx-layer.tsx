'use client';

import { useEffect, useMemo, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import type { PinochleSuit } from '@parlour/game-pinochle';
import { gsap } from 'gsap';
import { buildPinochleTimeline, type PinochleCue } from '@/lib/pinochle/fx';
import { prefersCalmMotion } from '@/lib/table/calm-motion';
import { zonePoint } from '../fx-animation';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/pinochle.module.css';

const SUIT_GLYPH: Record<PinochleSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR: Record<PinochleSuit, string> = {
  S: '#cfd8e0',
  H: '#e05a4e',
  D: '#e05a4e',
  C: '#7fd1c1',
};

export function usePinochleFxAnimation(
  fx: readonly FxEvent[],
  rootRef: RefObject<HTMLElement | null>,
  key: string | number,
) {
  const cues = useMemo(() => {
    try {
      return buildPinochleTimeline(fx);
    } catch {
      return [] as PinochleCue[];
    }
  }, [fx]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || cues.length === 0) return;
    const reduced = prefersCalmMotion();
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

        if (cue.type === 'hand-score') {
          const point = { x: bounds.width / 2, y: bounds.height * 0.34 };
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.4 }, start)
            .to(
              element,
              { autoAlpha: 1, scale: 1.12, duration: 0.24, ease: 'back.out(2.2)' },
              start,
            )
            .to(element, { scale: 1, duration: 0.14 }, start + 0.24)
            .to(
              element,
              { autoAlpha: 0, y: '-=18', duration: 0.28 },
              start + cue.durationMs / 1000 - 0.32,
            );
        } else if (cue.type === 'meld') {
          const point = zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y - 30, autoAlpha: 0, scale: 0.5 }, start)
            .to(
              element,
              { autoAlpha: 1, scale: 1.15, duration: 0.22, ease: 'back.out(2.4)' },
              start,
            )
            .to(element, { scale: 1, duration: 0.12 }, start + 0.22)
            .to(
              element,
              { autoAlpha: 0, y: '-=22', duration: 0.26 },
              start + cue.durationMs / 1000 - 0.3,
            );
        } else if (cue.type === 'score-chip') {
          const point = zonePoint(`seat:${cue.team}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y - 26, autoAlpha: 0, scale: 0.6 }, start)
            .to(element, { autoAlpha: 1, scale: 1.15, duration: 0.2, ease: 'back.out(2)' }, start)
            .to(element, { autoAlpha: 0, y: '-=30', duration: 0.24 }, start + 0.32);
        } else if (cue.type === 'auction-won' || cue.type === 'trump') {
          const point = zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.7 }, start)
            .to(element, { autoAlpha: 0.95, scale: 1, duration: 0.2, ease: 'power2.out' }, start)
            .to(element, { autoAlpha: 0, duration: 0.22 }, start + cue.durationMs / 1000 - 0.22);
        } else {
          // a quiet bid/pass pop over the acting seat
          const point = zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.7 }, start)
            .to(element, { autoAlpha: 0.9, scale: 1, duration: 0.16, ease: 'power2.out' }, start)
            .to(element, { autoAlpha: 0, duration: 0.18 }, start + cue.durationMs / 1000 - 0.18);
        }
      }
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key]);

  return cues;
}

/** Renders the DOM the pinochle animator animates; keep in sync with lib/pinochle/fx.ts. */
export function PinochleFxLayer({
  fx,
  fxKey,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const cues = usePinochleFxAnimation(fx, rootRef, fxKey);
  return (
    <div className={tableStyles.fxLayer} aria-live="polite">
      {cues.map((cue) => {
        if (cue.type === 'bid') {
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={
                {
                  '--pop-accent': cue.bid === null ? 'rgba(207,216,224,0.5)' : '#8a5a44',
                } as CSSProperties
              }
            >
              {cue.bid === null ? 'Pass' : `Bid ${cue.bid}`}
            </div>
          );
        }
        if (cue.type === 'auction-won') {
          return (
            <div key={`${fxKey}:${cue.id}`} data-fx-cue={cue.id} className={styles.fxSeatPop}>
              Won the bid at {cue.bid}!
            </div>
          );
        }
        if (cue.type === 'trump') {
          const suit = cue.suit as PinochleSuit;
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': SUIT_COLOR[suit] } as CSSProperties}
            >
              Trump: {SUIT_GLYPH[suit]}
            </div>
          );
        }
        if (cue.type === 'meld') {
          return (
            <div key={`${fxKey}:${cue.id}`} data-fx-cue={cue.id} className={styles.fxSeatPop}>
              +{cue.total} meld
            </div>
          );
        }
        if (cue.type === 'score-chip') {
          return (
            <div key={`${fxKey}:${cue.id}`} data-fx-cue={cue.id} className={styles.fxSeatPop}>
              {cue.total}
            </div>
          );
        }
        if (cue.type === 'hand-score') {
          return (
            <div
              key={`${fxKey}:${cue.id}`}
              data-fx-cue={cue.id}
              className={styles.fxBanner}
              style={{ '--banner-accent': cue.set ? '#a06bb4' : '#5fae7b' } as CSSProperties}
            >
              <strong>{cue.set ? 'SET!' : 'MADE!'}</strong>
              <span>bid was {cue.bid}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export const PINOCHLE_SUIT_META = { SUIT_GLYPH, SUIT_COLOR };
