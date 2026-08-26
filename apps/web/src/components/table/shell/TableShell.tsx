'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
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

type Announcement = { id: number; text: string };
type Announce = (text: string) => void;

const TableAnnouncerContext = createContext<Announce>(() => undefined);

/** Publishes one terse update through the shell's single polite live region. */
export function useTableAnnouncer(): Announce {
  return useContext(TableAnnouncerContext);
}

/** The `<main>` chassis shared by every table screen. */
export function TableShell({ rootRef, className, dealState, children }: TableShellProps) {
  const [announcement, setAnnouncement] = useState<Announcement>({ id: 0, text: '' });
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const announce = useCallback<Announce>((text) => {
    if (text.length === 0) return;
    setAnnouncement((current) => ({ id: current.id + 1, text }));
  }, []);

  const rememberFocus = useCallback((event: ReactFocusEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement) lastFocusedElement.current = event.target;
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const previous = lastFocusedElement.current;
    if (!root || !previous || previous.isConnected) return;

    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;

    // WebKit loses its sequential-navigation starting point when a focused
    // decision rail is removed. Keep keyboard players in the table by handing
    // them to the newly playable hand, or to the table itself when play has
    // passed to another seat.
    const destination =
      root.querySelector<HTMLElement>('[data-hand-card] button:not(:disabled)[tabindex="0"]') ??
      root.querySelector<HTMLElement>('[data-hand-card] button:not(:disabled)') ??
      root;
    destination.focus();
    lastFocusedElement.current = destination;
  });

  // Scoped to the shell rather than the app: a table earns the battery, a menu
  // does not. Leaving the table unmounts this and hands the screen back.
  useEffect(() => keepScreenAwake(), []);

  return (
    <TableAnnouncerContext.Provider value={announce}>
      <main
        ref={rootRef}
        className={className ? `${styles.screen} ${className}` : styles.screen}
        data-table-screen
        data-deal-state={dealState}
        tabIndex={-1}
        onFocusCapture={rememberFocus}
        onKeyDown={moveTableFocus}
      >
        {children}
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-table-announcer
        >
          <span key={announcement.id}>{announcement.text}</span>
        </p>
      </main>
    </TableAnnouncerContext.Provider>
  );
}

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function moveTableFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return;
  const target = event.target;
  const root = event.currentTarget;
  const handCard = target.closest<HTMLElement>('[data-hand-card]');
  const zone = target.closest<HTMLElement>('[data-zone]');
  if (!handCard && !zone) return;

  if (event.key === 'Enter' && isTableControl(target)) {
    event.preventDefault();
    target.click();
    return;
  }
  if (!NAVIGATION_KEYS.has(event.key)) return;

  const hand = handCard?.closest<HTMLElement>('[role="list"]');
  const controls = tableControls(hand ?? root).filter((control) => {
    if (hand)
      return control.closest('[role="list"]') === hand && control.closest('[data-hand-card]');
    return control.closest('[data-zone]') !== null;
  });
  const current = controls.indexOf(target);
  if (current < 0 || controls.length < 2) return;

  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (current - 1 + controls.length) % controls.length
          : (current + 1) % controls.length;
  controls[next]?.focus();
}

function tableControls(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [role="button"][tabindex]:not([tabindex="-1"])',
    ),
  ].filter((control) => control.closest('[aria-hidden="true"]') === null);
}

function isTableControl(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement && !element.disabled) ||
    (element.getAttribute('role') === 'button' && element.getAttribute('aria-disabled') !== 'true')
  );
}
