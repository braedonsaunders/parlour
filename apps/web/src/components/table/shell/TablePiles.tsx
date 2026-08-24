import type { ReactNode } from 'react';
import styles from '@/styles/table.module.css';

/** The centre cluster holding a table's stock and discard. */
export function TablePiles({
  localTurn,
  centerPiles,
  children,
}: {
  localTurn: boolean;
  /** Marks tables whose piles anchor the middle of the felt. */
  centerPiles?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.piles}
      data-center-piles={centerPiles ? true : undefined}
      data-local-turn={localTurn}
    >
      {children}
    </div>
  );
}

export type StockPileProps = {
  count: number;
  disabled: boolean;
  onClick?: () => void;
  className?: string;
  /** Published as `data-can-draw` for tables that light the pile up. */
  canDraw?: boolean;
  /** The back rendered on top of the stock — each deck brings its own. */
  card: ReactNode;
  children?: ReactNode;
};

export function StockPile({
  count,
  disabled,
  onClick,
  className,
  canDraw,
  card,
  children,
}: StockPileProps) {
  return (
    <button
      type="button"
      data-zone="stock"
      className={className ? `${styles.pileButton} ${className}` : styles.pileButton}
      data-can-draw={canDraw}
      disabled={disabled}
      onClick={onClick}
      aria-label={`Draw from stock, ${count} cards remain`}
    >
      {card}
      <span className={styles.pileCount}>{count}</span>
      {children}
    </button>
  );
}

/** The discard as a draw target: a tappable fan of the top few cards. */
export function DiscardPileButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick?: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-zone="discard"
      className={`${styles.pileButton} ${styles.discardPile}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}
