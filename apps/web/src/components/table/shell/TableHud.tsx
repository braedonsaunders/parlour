import type { ReactNode } from 'react';
import styles from '@/styles/table.module.css';

/** The ••• affordance that opens the shared table menu. */
export function TableMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.menuButton} btn-fat btn-fat--ghost`}
      aria-label="Table menu"
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      •••
    </button>
  );
}

export type TableTitlePillProps = {
  /** The game's name, set in the HUD's small caps. */
  eyebrow: ReactNode;
  /** The live phase line beside it. */
  status: ReactNode;
  className?: string;
  /** Trailing content inside the pill, for tables that carry scores there. */
  children?: ReactNode;
};

export function TableTitlePill({ eyebrow, status, className, children }: TableTitlePillProps) {
  return (
    <div className={className ? `pill-soft ${className}` : 'pill-soft'}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <strong>{status}</strong>
      {children}
    </div>
  );
}

/**
 * The table header bar. Everything left of the menu button is a slot so each
 * game keeps its own HUD cluster — team scores, clocks, score strips.
 */
export function TableHud({
  onOpenMenu,
  children,
}: {
  onOpenMenu: () => void;
  children: ReactNode;
}) {
  return (
    <header className={styles.hud}>
      {children}
      <TableMenuButton onOpen={onOpenMenu} />
    </header>
  );
}
