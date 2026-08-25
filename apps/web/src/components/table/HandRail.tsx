'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import {
  useCardArriving,
  useCardDeparting,
  useFanReceiving,
} from '@/lib/table/arrival-presentation';
import styles from '@/styles/table.module.css';

export type HandRailProps = {
  count: number;
  zone: string;
  label: string;
  dealState?: 'dealing' | 'complete';
  /** Full ordered hand, including cards still waiting for a gap. */
  fanPlan?: readonly string[];
  /** Card that should land in the lifted just-drawn seat. */
  liftCard?: string | null;
  /** Loosen the fan for faces that carry a large central mark. */
  fanStepRatio?: number;
  children: ReactNode;
};

export type HandRailCardProps = {
  cardId: string;
  index: number;
  count: number;
  playable?: boolean;
  /** Marks the card the seat just drew, so the fan can call it out. */
  justDrawn?: boolean;
  children: ReactNode;
};

/** How much of a card the next one may cover, when there is room to choose. */
export const DEFAULT_FAN_STEP_RATIO = 0.48;

/**
 * `ratio` is the largest share of a card's width the fan will advance by, so a
 * bigger number means a looser fan showing more of each card. Games whose faces
 * carry a large central mark need a looser one: at the default, the visible
 * band ends at 51% and a numeral centred at 50% is sliced exactly in half.
 */
export function calculateFanStep(
  width: number,
  cardWidth: number,
  count: number,
  ratio: number = DEFAULT_FAN_STEP_RATIO,
): number {
  if (count <= 1 || width <= 0 || cardWidth <= 0) return 0;
  /*
   * The gutter grows with the ratio because the fan is an arc, not a row: the
   * outermost cards are rotated, so they reach further than this linear step
   * accounts for, and the wider the fan the further they reach. At the default
   * ratio the factor is exactly 1 and nothing moves — the reserve only appears
   * for a game that has asked to spread out, which is the only case where the
   * edge cards were running off a narrow screen.
   */
  const spread = 1 + (ratio / DEFAULT_FAN_STEP_RATIO - 1) * 1.25;
  const edgeGutter = Math.max(20, Math.min(40, width * 0.06)) * spread;
  const availableSpan = Math.max(0, width - edgeGutter * 2 - cardWidth);
  return Math.min(cardWidth * ratio, availableSpan / (count - 1));
}

/**
 * The ratio a rail was rendered with.
 *
 * Read from the DOM rather than passed around because the flight animation
 * targets the same fan from a completely different call path — if the two ever
 * disagreed, cards would land beside the slot they were flying to.
 */
export function fanStepRatioOf(rail: HTMLElement): number {
  const declared = Number.parseFloat(rail.dataset.fanRatio ?? '');
  return Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_FAN_STEP_RATIO;
}

/** Shared motion and hit-target chassis for every playable card in a hand rail. */
export function HandRailCard({
  cardId,
  index,
  count,
  playable,
  justDrawn,
  children,
}: HandRailCardProps) {
  const arriving = useCardArriving(cardId);
  const departing = useCardDeparting(cardId);
  const receiving = useFanReceiving();
  const fanIndex = index - (count - 1) / 2;
  return (
    <motion.div
      // `layout` re-flows the fan when a card joins or leaves. A `layoutId` on
      // top of it registered every card in motion's shared-layout map and had
      // it measured on every commit — projection work that showed up as one of
      // the hottest functions in a profile — to buy a shared transition
      // between containers that no table performs. Cards leave the rail as
      // engine fx flights, not as layout animations.
      layout={!receiving}
      className={styles.handCard}
      role="listitem"
      data-hand-card
      data-card-id={cardId}
      data-flight-target={cardId}
      data-fan-index={fanIndex}
      data-playable={playable}
      data-just-drawn={justDrawn || undefined}
      data-arriving={arriving || undefined}
      data-departing={departing || undefined}
      aria-hidden={arriving || departing || undefined}
      style={{ '--fan-index': fanIndex, '--fan-abs': Math.abs(fanIndex) } as CSSProperties}
      initial={arriving ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -24, opacity: 0 }}
      transition={{ duration: receiving ? 0.2 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.handFan} data-hand-fan>
        {children}
      </div>
    </motion.div>
  );
}

/** A cards-only fan; player HUD and controls belong in the table's side gutters. */
/** The rail and card widths a fan step is computed from. Only the viewport moves these. */
type FanGeometry = { width: number; cardWidth: number };

const NO_GEOMETRY: FanGeometry = { width: 0, cardWidth: 0 };

export function HandRail({
  count,
  zone,
  label,
  dealState,
  fanPlan,
  liftCard,
  fanStepRatio = DEFAULT_FAN_STEP_RATIO,
  children,
}: HandRailProps) {
  const receiving = useFanReceiving();
  const railRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<FanGeometry>(NO_GEOMETRY);

  // What the fan step needs from the DOM is the rail's width and one card's
  // width, and neither of those depends on how many cards are in the hand —
  // every card sits at the same absolutely-positioned box, and the fan spread
  // is a transform on the card's inner wrapper. Measuring on every count change
  // meant a querySelector, two forced layout reads and a rebuilt ResizeObserver
  // every time a card was played or drawn, several times a second during a
  // stacked pickup, to recompute a number from two values that had not moved.
  //
  // So the measurement is keyed to the thing that actually changes it — the
  // viewport — and the count is applied arithmetically during render.
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const firstCard = rail.querySelector<HTMLElement>('[data-hand-card]');
    const next: FanGeometry = {
      width: rail.clientWidth,
      cardWidth: firstCard?.offsetWidth ?? 0,
    };
    setGeometry((current) =>
      Math.abs(current.width - next.width) < 0.5 &&
      Math.abs(current.cardWidth - next.cardWidth) < 0.5
        ? current
        : next,
    );
  }, []);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    measure();
    window.addEventListener('resize', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(rail);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure]);

  // A rail that mounted empty has no card to measure, so the first hand to
  // arrive — and only the first — earns one extra measurement.
  useLayoutEffect(() => {
    if (count > 0 && geometry.cardWidth === 0) measure();
  }, [count, geometry.cardWidth, measure]);

  const step = calculateFanStep(geometry.width, geometry.cardWidth, count, fanStepRatio);
  const fanN = Math.max(count, 1);
  return (
    <div
      ref={railRef}
      className={styles.localHand}
      role="list"
      style={
        {
          '--fan-n': fanN,
          '--fan-un': 1 / fanN,
          '--fan-step': `${step}px`,
        } as CSSProperties
      }
      data-zone={zone}
      data-deal-state={dealState}
      data-receiving={receiving || undefined}
      data-fan-plan={fanPlan?.join(',') || undefined}
      data-fan-ratio={fanStepRatio}
      data-fan-lift={liftCard || undefined}
      // The fan's spread is a pure function of this count, published so a card
      // in flight can work out the angle of the slot it is aiming at by
      // arithmetic rather than by reading a computed transform back out of the
      // DOM — which meant a `getComputedStyle` and a matrix decode per flight.
      data-fan-count={fanN}
      aria-label={label}
    >
      <div className={styles.handTrack}>{children}</div>
    </div>
  );
}
