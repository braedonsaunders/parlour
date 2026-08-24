import type { CSSProperties, ReactNode } from 'react';
import styles from '@/styles/table.module.css';

export function stockStackDepth(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 4) return 2;
  if (count <= 12) return 3;
  if (count <= 28) return 4;
  return 5;
}

/** Face-down stock that reads as a deck, not a lone card. */
export function StockStack({
  count,
  compact,
  children,
}: {
  count: number;
  compact?: boolean;
  children: ReactNode;
}) {
  const depth = stockStackDepth(count);
  if (depth === 0) {
    return (
      <span
        className={styles.stockEmpty}
        data-zone-face
        data-compact={compact || undefined}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={styles.stockStack}
      data-compact={compact || undefined}
      data-stack-depth={depth}
      style={{ '--stack-n': depth } as CSSProperties}
    >
      {Array.from({ length: Math.max(0, depth - 1) }, (_, index) => (
        <span
          key={index}
          className={styles.stockStackLayer}
          style={{ '--layer': depth - 1 - index } as CSSProperties}
          aria-hidden="true"
        >
          {children}
        </span>
      ))}
      <span className={styles.stockStackFace} data-zone-face>
        {children}
      </span>
    </span>
  );
}
