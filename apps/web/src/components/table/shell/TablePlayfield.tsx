import type { ReactNode } from 'react';
import styles from '@/styles/table.module.css';

export type TablePlayfieldProps = {
  /** Accessible name for the felt, e.g. "Hearts table". */
  label: string;
  /** The glyph burnt into the felt. Omit to paint your own monogram. */
  feltMark?: ReactNode;
  className?: string;
  /** Published as `data-seat-count` for ring layouts that vary with the table. */
  seatCount?: number;
  children: ReactNode;
};

/** The felt: seats, piles, hand rail and fx layers all live inside it. */
export function TablePlayfield({
  label,
  feltMark,
  className,
  seatCount,
  children,
}: TablePlayfieldProps) {
  return (
    <section
      className={className ? `${styles.playfield} ${className}` : styles.playfield}
      aria-label={label}
      data-seat-count={seatCount}
    >
      {feltMark !== undefined && (
        <div className={styles.feltMark} aria-hidden="true">
          {feltMark}
        </div>
      )}
      {children}
    </section>
  );
}

/** The strip below the felt holding a table's committing actions. */
export function TableActionRail({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className ? `${styles.actionRail} ${className}` : styles.actionRail}>
      {children}
    </div>
  );
}

/** The shared "Your turn" whisper. Decorative: the phase line carries the text. */
export function TableTurnIndicator({ className }: { className?: string } = {}) {
  return (
    <span
      className={className ? `${styles.turnIndicator} ${className}` : styles.turnIndicator}
      aria-hidden="true"
    >
      Your turn
    </span>
  );
}
