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

  const recoverOrphanedFocus = useCallback(() => {
    const root = rootRef.current;
    const previous = lastFocusedElement.current;
    if (!root?.isConnected || !previous || focusAvailable(previous)) return;

    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== document.documentElement &&
      focusAvailable(active)
    ) {
      // A dialog may have restored focus outside the table before this
      // observer runs. Forget the old table control so a later animation does
      // not pull that deliberate focus back into the felt.
      if (!root.contains(active)) lastFocusedElement.current = null;
      return;
    }

    // A choice that replaces the played card comes first, then the newly
    // playable hand. With neither available, the table itself is an honest
    // starting point while another seat acts.
    const destination =
      firstAvailable(root, '[role="dialog"] button:not(:disabled)') ??
      firstAvailable(root, '[role="alertdialog"] button:not(:disabled)') ??
      firstAvailable(root, '[data-hand-card] button:not(:disabled)[tabindex="0"]') ??
      firstAvailable(root, '[data-hand-card] button:not(:disabled)') ??
      firstAvailable(root, '[data-table-actions] button:not(:disabled)') ??
      firstAvailable(root, '[role="group"] button:not(:disabled)') ??
      root;
    destination.focus();
    lastFocusedElement.current = destination;
  }, [rootRef]);

  useLayoutEffect(recoverOrphanedFocus);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Motion keeps an exiting card connected until its flight ends. That
    // removal happens below TableShell, after the parent commit whose layout
    // effect used to be the only recovery chance. Watch the actual DOM
    // lifetime, plus controls that become unavailable without unmounting.
    const observer = new MutationObserver(recoverOrphanedFocus);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-disabled', 'aria-hidden', 'disabled', 'hidden', 'inert'],
    });
    return () => observer.disconnect();
  }, [recoverOrphanedFocus, rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const boundary = root?.parentElement;
    if (!root || !boundary) return;
    return () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !root.contains(active) || !boundary.isConnected) {
        return;
      }

      // The shell cannot focus the podium or shelf before that route exists.
      // Keep WebKit's sequential-navigation origin on the stable page boundary
      // while Next swaps the table out; its route focus then takes over when
      // the destination mounts.
      const previousTabIndex = boundary.getAttribute('tabindex');
      boundary.tabIndex = -1;
      boundary.focus({ preventScroll: true });
      boundary.addEventListener(
        'blur',
        () => {
          if (previousTabIndex === null) boundary.removeAttribute('tabindex');
          else boundary.setAttribute('tabindex', previousTabIndex);
        },
        { once: true },
      );
    };
  }, [rootRef]);

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

function focusAvailable(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  return element.closest('[aria-hidden="true"], [hidden], [inert]') === null;
}

function firstAvailable(root: HTMLElement, selector: string): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>(selector)].find(focusAvailable) ?? null;
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
