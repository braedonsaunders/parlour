import { Fragment, type ReactNode } from 'react';
import styles from '@/styles/table.module.css';

export type OpponentFanProps = {
  /** Cards the seat holds; the announced count, even when the fan caps below it. */
  count: number;
  /** How many backs the fan ever paints. */
  max: number;
  /** Total degrees the fan spans across the painted backs. */
  spread: number;
  renderCard: (card: { index: number; rotation: number }) => ReactNode;
};

/** The capped, evenly-splayed fan of face-down backs above an opponent's plate. */
export function OpponentFan({ count, max, spread, renderCard }: OpponentFanProps) {
  const visible = Math.min(count, max);
  const step = visible > 1 ? spread / (visible - 1) : 0;
  return (
    <div className={styles.opponentCards} aria-label={`${count} hidden cards`}>
      {Array.from({ length: visible }, (_, index) => (
        <Fragment key={index}>
          {renderCard({ index, rotation: (index - (visible - 1) / 2) * step })}
        </Fragment>
      ))}
    </div>
  );
}

/** Name and bot marker under a seat's avatar. */
export function SeatNameplate({ name, isBot }: { name: ReactNode; isBot?: boolean }) {
  return (
    <div className={styles.nameplate}>
      <strong>{name}</strong>
      {isBot && <small>bot</small>}
    </div>
  );
}
