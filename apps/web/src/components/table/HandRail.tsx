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

export function calculateFanStep(width: number, cardWidth: number, count: number): number {
  if (count <= 1 || width <= 0 || cardWidth <= 0) return 0;
  const edgeGutter = Math.max(20, Math.min(40, width * 0.06));
  const availableSpan = Math.max(0, width - edgeGutter * 2 - cardWidth);
  return Math.min(cardWidth * 0.48, availableSpan / (count - 1));
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
      layout={!receiving}
      layoutId={`card:${cardId}`}
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
export function HandRail({
  count,
  zone,
  label,
  dealState,
  fanPlan,
  liftCard,
  children,
}: HandRailProps) {
  const receiving = useFanReceiving();
  const railRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  const updateStep = useCallback(() => {
    const rail = railRef.current;
    const firstCard = rail?.querySelector<HTMLElement>('[data-hand-card]');
    if (!rail || !firstCard) {
      setStep(0);
      return;
    }
    const next = calculateFanStep(rail.clientWidth, firstCard.offsetWidth, count);
    setStep((current) => (Math.abs(current - next) < 0.25 ? current : next));
  }, [count]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    updateStep();
    window.addEventListener('resize', updateStep, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateStep);
    observer?.observe(rail);
    const firstCard = rail.querySelector<HTMLElement>('[data-hand-card]');
    if (firstCard) observer?.observe(firstCard);
    return () => {
      window.removeEventListener('resize', updateStep);
      observer?.disconnect();
    };
  }, [count, updateStep]);

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
      data-fan-lift={liftCard || undefined}
      aria-label={label}
    >
      <div className={styles.handTrack}>{children}</div>
    </div>
  );
}
