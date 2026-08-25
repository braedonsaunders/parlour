'use client';

import { useMemo, useEffect, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { gsap } from 'gsap';
import { prefersCalmMotion } from '@/lib/table/calm-motion';
import { buildSpadesTimeline, type SpadesCue } from '@/lib/spades/fx';
import { zonePoint } from '../fx-animation';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/spades.module.css';

const TEAM_ACCENTS: readonly [string, string] = ['#6f7fb0', '#c98a4b'];

/**
 * Animates the namespaced `spades.*` moments. Trick flights and turn rings are
 * neutral `tricks.*`/`turn.ring` cues that the shared TableFxLayer already
 * paints, so nothing here duplicates them.
 */
export function useSpadesFxAnimation(
  fx: readonly FxEvent[],
  rootRef: RefObject<HTMLElement | null>,
  key: string | number,
  localSeat: number,
  /** Profile-level calm motion; the OS media query is honoured either way. */
  forceReduced = false,
) {
  const cues = useMemo(() => {
    try {
      return buildSpadesTimeline(fx);
    } catch {
      return [] as SpadesCue[];
    }
  }, [fx]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || cues.length === 0) return;
    const reduced = forceReduced || prefersCalmMotion();
    if (reduced) {
      // Calm motion has to mean no waiting, not merely no travel. Flashing each
      // cue in place still held the timeline open for the cue's full duration —
      // a hand-score sheet kept a reduced-motion player waiting 1.7s for a
      // banner that never moved. Every one of these moments also has a
      // permanent home on the table (seat bid chips, the broken-spades flag,
      // the last-hand panel), so the honest answer is to skip the transient
      // layer outright rather than stage a silent version of it.
      const context = gsap.context(() => {
        for (const cue of cues) {
          const element = root.querySelector<HTMLElement>(`[data-fx-cue="${cue.id}"]`);
          if (element) gsap.set(element, { autoAlpha: 0 });
        }
      }, root);
      return () => context.revert();
    }

    const bounds = root.getBoundingClientRect();
    const context = gsap.context(() => {
      const timeline = gsap.timeline();
      for (const cue of cues) {
        const element = root.querySelector<HTMLElement>(`[data-fx-cue="${cue.id}"]`);
        if (!element) continue;
        const start = cue.startMs / 1000;

        if (cue.type === 'bid') {
          const point = zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.6 }, start)
            .to(
              element,
              { autoAlpha: 1, scale: 1.14, duration: 0.18, ease: 'back.out(2.4)' },
              start,
            )
            .to(element, { scale: 1, duration: 0.12 }, start + 0.18)
            .to(element, { autoAlpha: 0, duration: 0.18 }, start + cue.durationMs / 1000 - 0.18);
        } else if (cue.type === 'nil-made' || cue.type === 'nil-failed') {
          const point = zonePoint(`seat:${cue.seat}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.5 }, start)
            .to(
              element,
              { autoAlpha: 1, scale: 1.16, duration: 0.24, ease: 'back.out(2.2)' },
              start,
            )
            .to(element, { scale: 1, duration: 0.14 }, start + 0.24)
            .to(
              element,
              { autoAlpha: 0, y: '-=20', duration: 0.28 },
              start + cue.durationMs / 1000 - 0.3,
            );
        } else if (cue.type === 'score-chip' || cue.type === 'bag-penalty') {
          const point = zonePoint(`seat:${cue.team}` as never, root, bounds);
          timeline
            .set(element, { x: point.x, y: point.y - 26, autoAlpha: 0, scale: 0.6 }, start)
            .to(element, { autoAlpha: 1, scale: 1.15, duration: 0.2, ease: 'back.out(2)' }, start)
            .to(element, { autoAlpha: 0, y: '-=30', duration: 0.24 }, start + 0.32);
        } else {
          // hand-score sheet, bids-complete and the spades-broken flare all land
          // centre-table where the trick just resolved.
          const point = { x: bounds.width / 2, y: bounds.height * 0.36 };
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.55 }, start)
            .to(element, { autoAlpha: 1, scale: 1.08, duration: 0.24, ease: 'back.out(2)' }, start)
            .to(element, { scale: 1, duration: 0.16 }, start + 0.24)
            .to(
              element,
              { autoAlpha: 0, y: '-=16', duration: 0.3 },
              start + cue.durationMs / 1000 - 0.32,
            );
        }
      }
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key, localSeat, forceReduced]);

  return cues;
}

/** Renders the DOM the Spades animator drives; keep in sync with lib/spades/fx.ts. */
export function SpadesFxLayer({
  fx,
  fxKey,
  localSeat,
  rootRef,
  reduced = false,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  localSeat: number;
  rootRef: RefObject<HTMLElement | null>;
  reduced?: boolean;
}) {
  const cues = useSpadesFxAnimation(fx, rootRef, fxKey, localSeat, reduced);
  return (
    <div className={tableStyles.fxLayer} aria-live="polite">
      {cues.map((cue) => {
        const key = `${fxKey}:${cue.id}`;
        if (cue.type === 'bid') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              data-nil={cue.nil || undefined}
              style={
                {
                  '--pop-accent': cue.nil ? '#f0c04e' : TEAM_ACCENTS[cue.seat % 2],
                } as CSSProperties
              }
            >
              {cue.nil ? 'Nil!' : `Bids ${cue.bid ?? 0}`}
            </div>
          );
        }
        if (cue.type === 'bids-complete') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxBanner}
              style={{ '--banner-accent': '#6f7fb0' } as CSSProperties}
            >
              <strong>BIDS IN</strong>
              <span>
                {cue.contracts[0] ?? 0} vs {cue.contracts[1] ?? 0} · 13 tricks on the table
              </span>
            </div>
          );
        }
        if (cue.type === 'spades-broken') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxBanner}
              data-broken
              style={{ '--banner-accent': '#cfd8e0' } as CSSProperties}
            >
              <strong>♠ BROKEN</strong>
              <span>spades may be led</span>
            </div>
          );
        }
        if (cue.type === 'nil-made' || cue.type === 'nil-failed') {
          const made = cue.type === 'nil-made';
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': made ? '#5fae7b' : '#c8566b' } as CSSProperties}
            >
              {made ? 'NIL MADE +100' : 'NIL BROKEN −100'}
            </div>
          );
        }
        if (cue.type === 'bag-penalty') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': '#c8566b' } as CSSProperties}
            >
              bag penalty −{cue.penalty} points · {cue.bags} bag{cue.bags === 1 ? '' : 's'} left
            </div>
          );
        }
        if (cue.type === 'score-chip') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              className={styles.fxSeatPop}
              style={{ '--pop-accent': TEAM_ACCENTS[cue.team % 2] } as CSSProperties}
            >
              {cue.delta >= 0 ? `+${cue.delta}` : cue.delta} → {cue.total}
            </div>
          );
        }
        if (cue.type === 'hand-score') {
          return (
            <div
              key={key}
              data-fx-cue={cue.id}
              data-testid="spades-hand-score"
              className={styles.handSheet}
            >
              <strong className={styles.handSheetTitle}>Hand {cue.handNo}</strong>
              <ul className={styles.handSheetRows}>
                {cue.teams.map((team) => (
                  <li
                    key={team.team}
                    className={styles.handSheetRow}
                    data-team={team.team}
                    data-made={team.made || undefined}
                    style={{ '--row-accent': TEAM_ACCENTS[team.team % 2] } as CSSProperties}
                  >
                    <span className={styles.handSheetLabel}>
                      {team.made ? 'made' : 'set'} {team.nonNilTricks}/{team.contract}
                    </span>
                    <span className={styles.handSheetDelta}>
                      {team.delta >= 0 ? `+${team.delta}` : team.delta}
                    </span>
                    <span className={styles.handSheetMeta}>
                      {team.bagsTaken > 0
                        ? `${team.bagsTaken} bag${team.bagsTaken === 1 ? '' : 's'}`
                        : 'clean'}
                      {team.bagPenalty > 0 ? ` · −${team.bagPenalty}` : ''}
                    </span>
                    <span className={styles.handSheetTotal}>{team.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export const SPADES_TEAM_ACCENTS = TEAM_ACCENTS;
