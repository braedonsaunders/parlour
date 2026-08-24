'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { keepScreenAwake } from '@/lib/wake-lock';
import styles from '@/styles/table.module.css';
import type { DealStateAttr } from './dealState';

export type TableShellProps = {
  /** Anchors fx flights and zone measurement; every cue is queried from here. */
  rootRef: RefObject<HTMLElement | null>;
  /** Extra root class for tables that layer their own felt. */
  className?: string;
  dealState?: DealStateAttr;
  children: ReactNode;
};

/** The `<main>` chassis shared by every table screen. */
export function TableShell({ rootRef, className, dealState, children }: TableShellProps) {
  // Scoped to the shell rather than the app: a table earns the battery, a menu
  // does not. Leaving the table unmounts this and hands the screen back.
  useEffect(() => keepScreenAwake(), []);

  return (
    <main
      ref={rootRef}
      className={className ? `${styles.screen} ${className}` : styles.screen}
      data-table-screen
      data-deal-state={dealState}
    >
      {children}
    </main>
  );
}
