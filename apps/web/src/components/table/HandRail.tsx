'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import styles from '@/styles/table.module.css';

export type HandRailProps = {
  count: number;
  zone: string;
  label: string;
  accessory?: ReactNode;
  children: ReactNode;
};

export function calculateFanStep(width: number, cardWidth: number, count: number): number {
  if (count <= 1 || width <= 0 || cardWidth <= 0) return 0;
  const edgeGutter = Math.max(20, Math.min(40, width * 0.06));
  const availableSpan = Math.max(0, width - edgeGutter * 2 - cardWidth);
  return Math.min(cardWidth * 0.48, availableSpan / (count - 1));
}

/** A centered UNO-style fan that compresses to keep every card inside the table rail. */
export function HandRail({ count, zone, label, accessory, children }: HandRailProps) {
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

  useEffect(() => {
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
      style={
        {
          '--fan-n': fanN,
          '--fan-un': 1 / fanN,
          '--fan-step': `${step}px`,
        } as CSSProperties
      }
      data-zone={zone}
      aria-label={label}
    >
      {accessory}
      <div className={styles.handTrack}>{children}</div>
    </div>
  );
}
