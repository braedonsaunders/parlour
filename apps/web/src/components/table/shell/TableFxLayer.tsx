'use client';

import { Fragment, useMemo, type ReactNode, type RefObject } from 'react';
import type { FxEvent } from '@parlour/engine';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { useFxAnimation } from '../fx-animation';
import styles from '@/styles/table.module.css';

export type TableFxLayerProps = {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  /** Paints one planned cue. Return null for cues this table does not narrate. */
  renderCue: (cue: FxCue) => ReactNode;
  /**
   * `hidden` marks the layer decorative, for tables that narrate their moments
   * from a second, game-specific layer.
   */
  presentation?: 'live' | 'hidden';
  /**
   * Profile-level calm motion. Optional: omitted, the layer keeps honouring the
   * OS media query exactly as before.
   */
  reduced?: boolean;
  /** Extra flights a table paints outside the shared cue timeline. */
  children?: ReactNode;
};

function planFxTimeline(fx: readonly FxEvent[]): {
  cues: readonly FxCue[];
  error: string | null;
} {
  try {
    return { cues: buildFxTimeline(fx), error: null };
  } catch (caught) {
    return {
      cues: [],
      error: caught instanceof Error ? caught.message : 'Invalid table effect',
    };
  }
}

/**
 * The shared fx surface: plans the cue timeline, drives it through GSAP and
 * paints whatever the table returns for each cue. A cue the engine cannot plan
 * degrades to a skipped-animation note rather than taking the table down.
 */
export function TableFxLayer({
  fx,
  fxKey,
  rootRef,
  renderCue,
  presentation = 'live',
  reduced = false,
  children,
}: TableFxLayerProps) {
  const planned = useMemo(() => planFxTimeline(fx), [fx]);

  useFxAnimation(planned.cues, rootRef, fxKey, reduced);

  return (
    <div
      className={styles.fxLayer}
      aria-live={presentation === 'live' ? 'polite' : undefined}
      aria-hidden={presentation === 'hidden' ? 'true' : undefined}
    >
      {planned.error && <div className={styles.fxError}>Animation skipped: {planned.error}</div>}
      {planned.cues.map((cue) => (
        <Fragment key={`${fxKey}:${cue.id}`}>{renderCue(cue)}</Fragment>
      ))}
      {children}
    </div>
  );
}

/** The card-in-flight chassis: trail, the card itself, and the landing glint. */
export function TableCardFlight({ cueId, children }: { cueId: string; children: ReactNode }) {
  return (
    <div data-fx-cue={cueId} data-card-flight className={styles.flyingCard}>
      <i className={styles.cardTrail} />
      <span data-flight-card className={styles.flightCardVisual}>
        {children}
      </span>
      <i className={styles.cardGlint} />
    </div>
  );
}

/** The ring that pops over a seat when the turn reaches it. */
export function TableTurnPop({ cueId, seat }: { cueId: string; seat: number }) {
  return <span data-fx-cue={cueId} data-seat-burst={seat} className={styles.turnPop} />;
}
