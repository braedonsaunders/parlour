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

/**
 * The capped, evenly-splayed fan of face-down backs above an opponent's plate.
 *
 * It positions ABSOLUTELY, so it only works inside a seat that is itself
 * positioned and has left room above it — the fixed compass-point layouts
 * satisfy both by construction. A table that flows its seats instead has to
 * opt out, and `data-opponent-fan` is how: `styles.opponentCards` is a hashed
 * CSS-module class, so another stylesheet cannot reach it by name and fails
 * silently if it tries.
 */
export function OpponentFan({ count, max, spread, renderCard }: OpponentFanProps) {
  const visible = Math.min(count, max);
  const step = visible > 1 ? spread / (visible - 1) : 0;
  return (
    <div className={styles.opponentCards} data-opponent-fan aria-label={`${count} hidden cards`}>
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
